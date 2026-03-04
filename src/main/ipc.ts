/**
 * IPC handler registration — bridges renderer requests to main process operations.
 *
 * All file I/O happens here (main process side).
 * Renderer communicates via contextBridge-exposed invoke calls.
 */

import { ipcMain, dialog, IpcMainInvokeEvent } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { loadPng, savePng } from './image-io';
import { parseDefinitionCsv } from './modfiles/definition-csv';
import { ModFileManager } from './modfiles/mod-file-manager';
import { saveDraft, listDrafts, loadDraftImage, loadDraftMetadata, deleteDraft } from './drafts';
import { existsSync } from 'fs';
import type { ProvinceData, CreateProvinceRequest, ReconcileRequest, PendingProvince, PendingSaveOptions, DraftSummary, DraftMetadata, RGB } from '@shared/types';

/** Active ModFileManager instance — created on load-mod, reused for save/create */
let activeManager: ModFileManager | null = null;

/**
 * Back up provinces.png to VMP-Backups/ before we touch anything.
 * Uses a timestamped subfolder that mirrors the mod's directory structure
 * so all VMP backups live in one place.
 */
async function backupOriginalMap(modPath: string): Promise<string> {
  const srcPath = path.join(modPath, 'map_data', 'provinces.png');
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const backupDir = path.join(modPath, 'VMP-Backups', `load_${stamp}`);

  await fs.mkdir(path.join(backupDir, 'map_data'), { recursive: true });

  const backupPath = path.join(backupDir, 'map_data', 'provinces.png');

  // Only copy if the backup doesn't already exist (e.g. rapid reloads)
  try {
    await fs.access(backupPath);
  } catch {
    await fs.copyFile(srcPath, backupPath);
  }

  return backupPath;
}

export function registerIpcHandlers(): void {
  /** Let the user pick a mod root directory */
  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select CK3 Mod Root Directory',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  /** Load the provinces.png from a mod directory, backing up the original first */
  ipcMain.handle('load-image', async (_event: IpcMainInvokeEvent, modPath: string) => {
    const imagePath = path.join(modPath, 'map_data', 'provinces.png');

    // Back up before we do anything else
    const backupPath = await backupOriginalMap(modPath);
    console.log(`Backed up provinces.png -> ${backupPath}`);

    return await loadPng(imagePath);
  });

  /** Save the provinces.png back to the mod directory */
  ipcMain.handle('save-image', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
    rgbaBuffer: Uint8Array,
    width: number,
    height: number,
  ) => {
    const imagePath = path.join(modPath, 'map_data', 'provinces.png');

    // Back up the current map to VMP-Backups/ before overwriting
    try {
      await fs.access(imagePath);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const backupPath = path.join(modPath, 'VMP-Backups', `save_${stamp}`, 'map_data', 'provinces.png');
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.copyFile(imagePath, backupPath);
    } catch {
      // File doesn't exist yet, no backup needed
    }

    return await savePng(imagePath, rgbaBuffer, width, height);
  });

  /** Load and parse definition.csv from a mod directory */
  ipcMain.handle('load-definitions', async (_event: IpcMainInvokeEvent, modPath: string) => {
    const csvPath = path.join(modPath, 'map_data', 'definition.csv');
    try {
      await fs.access(csvPath);
    } catch {
      return { provinces: [], error: 'definition.csv not found' };
    }
    const provinces = await parseDefinitionCsv(csvPath);
    console.log(`Loaded ${provinces.length} provinces from definition.csv`);
    return { provinces };
  });

  /**
   * Load the full mod directory: definition.csv + landed_titles + history.
   * Returns enriched province data with culture/religion/holding and title hierarchy.
   */
  ipcMain.handle('load-mod', async (_event: IpcMainInvokeEvent, modPath: string) => {
    activeManager = new ModFileManager(modPath);
    const result = await activeManager.load();
    if (!result.success) {
      activeManager = null;
    }
    console.log(`load-mod: ${result.success ? `${result.data?.provinces.length} provinces, ${result.data?.landedTitles.length} top-level titles` : result.error}`);
    return result;
  });

  /**
   * Get the de jure hierarchy for a province.
   * Returns array of LandedTitleNode from barony up to empire.
   */
  ipcMain.handle('get-hierarchy', async (_event: IpcMainInvokeEvent, provinceId: number) => {
    if (!activeManager) return [];
    return activeManager.getHierarchy(provinceId);
  });

  /**
   * Save modified mod files (definition.csv, history files).
   * Creates timestamped backups before writing.
   */
  ipcMain.handle('save-mod', async (_event: IpcMainInvokeEvent, data: {
    provinces: ProvinceData[];
    modifiedProvinceIds?: number[];
  }) => {
    if (!activeManager) {
      throw new Error('No mod loaded. Call load-mod first.');
    }
    await activeManager.save(data);
    console.log('save-mod: files written');
  });

  /**
   * Rename a title key in the landed_titles files.
   */
  ipcMain.handle('rename-title', async (
    _event: IpcMainInvokeEvent,
    oldKey: string,
    newKey: string
  ) => {
    if (!activeManager) {
      throw new Error('No mod loaded. Call load-mod first.');
    }
    const success = await activeManager.renameTitleKey(oldKey, newKey);
    console.log(`rename-title: ${oldKey} -> ${newKey} (${success ? 'ok' : 'not found'})`);
    return success;
  });

  /**
   * List all history province files in the mod's history/provinces/ directory.
   */
  ipcMain.handle('list-history-files', async () => {
    if (!activeManager) return [];
    return activeManager.getHistoryFiles();
  });

  /**
   * Create file stubs for a new province (history file + landed_titles entry).
   */
  ipcMain.handle('create-province', async (
    _event: IpcMainInvokeEvent,
    request: CreateProvinceRequest
  ) => {
    if (!activeManager) {
      throw new Error('No mod loaded. Call load-mod first.');
    }
    const province = await activeManager.createProvinceStubs(request);
    console.log(`create-province: created province ${province.id} "${province.name}"`);
    return province;
  });

  /**
   * Flush pending provinces — write deferred province entries to disk.
   * Called at save time when the user has pending (unsaved) provinces.
   */
  ipcMain.handle('flush-pending-provinces', async (
    _event: IpcMainInvokeEvent,
    data: { provinces: PendingProvince[]; options: PendingSaveOptions }
  ) => {
    if (!activeManager) {
      throw new Error('No mod loaded. Call load-mod first.');
    }
    await activeManager.flushPendingProvinces(data.provinces, data.options);
    console.log(`flush-pending-provinces: wrote ${data.provinces.length} provinces`);
  });

  /**
   * Reconcile provinces — remove orphaned entries and remap IDs.
   * Called after user confirms the reconciliation dialog.
   */
  ipcMain.handle('reconcile-provinces', async (
    _event: IpcMainInvokeEvent,
    data: ReconcileRequest
  ) => {
    if (!activeManager) {
      throw new Error('No mod loaded. Call load-mod first.');
    }
    await activeManager.reconcile(data);
    console.log(`reconcile-provinces: removed ${data.removedIds.length} provinces, remapped ${Object.keys(data.idMap).length} IDs`);
  });

  /* ── Heightmap overlay ────────────────────────────────────────────── */

  /**
   * Load heightmap.png from the mod's map_data/ directory.
   * Returns null if the file doesn't exist (heightmap is optional).
   * The heightmap is the same resolution as provinces.png.
   */
  ipcMain.handle('load-heightmap', async (_event: IpcMainInvokeEvent, modPath: string) => {
    const heightmapPath = path.join(modPath, 'map_data', 'heightmap.png');
    if (!existsSync(heightmapPath)) {
      return null;
    }
    try {
      const result = await loadPng(heightmapPath);
      console.log(`load-heightmap: loaded ${result.width}x${result.height} from ${heightmapPath}`);
      return result;
    } catch (err) {
      console.warn('load-heightmap: failed to load', err);
      return null;
    }
  });

  /* ── Draft operations ─────────────────────────────────────────────── */

  /** Save current state as a draft */
  ipcMain.handle('save-draft', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
    name: string,
    rgbaBuffer: Uint8Array,
    width: number,
    height: number,
    metadata: {
      pendingProvinces: PendingProvince[];
      pendingSaveOptions: PendingSaveOptions;
      emptyColors: RGB[];
      lockedColor: RGB | null;
    },
  ) => {
    await saveDraft(modPath, name, rgbaBuffer, width, height, metadata);
    console.log(`save-draft: saved "${name}" to ${modPath}/VMP-Drafts/`);
  });

  /** List available drafts for a mod */
  ipcMain.handle('list-drafts', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
  ): Promise<DraftSummary[]> => {
    return await listDrafts(modPath);
  });

  /** Load a draft's image */
  ipcMain.handle('load-draft-image', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
    folderName: string,
  ) => {
    return await loadDraftImage(modPath, folderName);
  });

  /** Load a draft's metadata */
  ipcMain.handle('load-draft-metadata', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
    folderName: string,
  ): Promise<DraftMetadata> => {
    return await loadDraftMetadata(modPath, folderName);
  });

  /** Delete a draft */
  ipcMain.handle('delete-draft', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
    folderName: string,
  ) => {
    await deleteDraft(modPath, folderName);
    console.log(`delete-draft: removed ${folderName} from ${modPath}/VMP-Drafts/`);
  });
}
