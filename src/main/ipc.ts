/**
 * IPC handler registration — bridges renderer requests to main process operations.
 *
 * All file I/O happens here (main process side).
 * Renderer communicates via contextBridge-exposed invoke calls.
 */

import { app, ipcMain, dialog, IpcMainInvokeEvent } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { ProjectLibraryStore } from './project-library';
import { writeSaveErrorLog } from './save-error-log';
import type { SaveFailureContext, SaveFailureReport } from '@shared/types';
import { loadPng, savePng } from './image-io';
import { parseDefinitionCsv } from './modfiles/definition-csv';
import { ModFileManager } from './modfiles/mod-file-manager';
import { saveDraft, listDrafts, loadDraftImage, loadDraftMetadata, deleteDraft } from './drafts';
import { existsSync } from 'fs';
import { inspect } from 'util';
import type { ProvinceData, CreateProvinceRequest, ReconcileRequest, PendingProvince, PendingSaveOptions, DraftSummary, DraftSaveData, DraftMetadata, RGB } from '@shared/types';

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
  // Lazy initialization keeps read-only mod loads independent of app metadata.
  let projects: ProjectLibraryStore | undefined;
  const library = () => projects ??= new ProjectLibraryStore(app.getPath('userData'));
  ipcMain.handle('get-project-library', () => library().get());
  ipcMain.handle('add-workshop-folder', async () => {
    const selection = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select Game Workshop Content Folder' });
    if (selection.canceled || selection.filePaths.length === 0) return null;
    return library().addFolder(selection.filePaths[0]);
  });
  ipcMain.handle('rescan-project-library', () => library().rescan());
  ipcMain.handle('remove-workshop-folder', (_event, folder: string) => library().removeFolder(folder));

  const lastSaveFailures = new Map<number, SaveFailureReport>();
  const logFailure = async (context: SaveFailureContext): Promise<SaveFailureReport> => {
    try {
      return await writeSaveErrorLog(context, {
        directory: path.join(app.getPath('userData'), 'logs'),
        appVersion: app.getVersion(),
      });
    } catch (error) {
      return { message: context.message, operation: context.operation, logPath: null,
        logError: error instanceof Error ? error.message : String(error) };
    }
  };
  const handleSave = <Args extends unknown[], Result>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: Args) => Promise<Result>,
  ) => ipcMain.handle(channel, async (event, ...args: Args) => {
    try {
      return await listener(event, ...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Capture the original main-process stack before Electron serializes the error.
      const report = await logFailure({ operation: channel, message,
        stack: inspect(error, { depth: 5, colors: false, customInspect: false }),
        target: typeof args[0] === 'string' ? args[0] : undefined });
      lastSaveFailures.set(event.sender?.id ?? 0, report);
      throw error;
    }
  });

  ipcMain.handle('report-save-failure', async (event, context: SaveFailureContext) => {
    const sender = event.sender?.id ?? 0;
    const previous = lastSaveFailures.get(sender);
    lastSaveFailures.delete(sender);
    if (previous && context.message.includes(previous.message)) return previous;
    return logFailure(context);
  });
  // Every request identifies its mod. Tab switches never change a global target.
  const managers = new Map<string, ModFileManager>();

  const modKey = (modPath: string): string => {
    if (typeof modPath !== 'string' || !modPath.trim() || !path.isAbsolute(modPath)) {
      throw new Error('An absolute mod path is required.');
    }
    return path.resolve(modPath);
  };

  const getManager = (modPath: string): ModFileManager => {
    const manager = managers.get(modKey(modPath));
    if (!manager) throw new Error('This mod is not loaded. Call load-mod for this path first.');
    return manager;
  };
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
  handleSave('save-image', async (
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
    const key = modKey(modPath);
    const manager = new ModFileManager(key);
    const result = await manager.load();
    if (result.success) managers.set(key, manager);
    console.log(`load-mod: ${result.success ? `${result.data?.provinces.length} provinces, ${result.data?.landedTitles.length} top-level titles` : result.error}`);
    return result;
  });

  /**
   * Get the de jure hierarchy for a province.
   * Returns array of LandedTitleNode from barony up to empire.
   */
  ipcMain.handle('get-hierarchy', async (_event: IpcMainInvokeEvent, modPath: string, provinceId: number) => {
    return getManager(modPath).getHierarchy(provinceId);
  });

  /**
   * Save modified mod files (definition.csv, history files).
   * Creates timestamped backups before writing.
   */
  handleSave('save-mod', async (_event: IpcMainInvokeEvent, modPath: string, data: {
    provinces: ProvinceData[];
    modifiedProvinceIds?: number[];
  }) => {
    const manager = getManager(modPath);
    await manager.save(data);
    console.log('save-mod: files written');
  });

  /**
   * Rename a title key in the landed_titles files.
   */
  handleSave('rename-title', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
    oldKey: string,
    newKey: string
  ) => {
    const manager = getManager(modPath);
    const success = await manager.renameTitleKey(oldKey, newKey);
    console.log(`rename-title: ${oldKey} -> ${newKey} (${success ? 'ok' : 'not found'})`);
    return success;
  });

  /**
   * List all history province files in the mod's history/provinces/ directory.
   */
  ipcMain.handle('list-history-files', async (_event: IpcMainInvokeEvent, modPath: string) => {
    return getManager(modPath).getHistoryFiles();
  });

  /**
   * Create file stubs for a new province (history file + landed_titles entry).
   */
  handleSave('create-province', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
    request: CreateProvinceRequest
  ) => {
    const manager = getManager(modPath);
    const province = await manager.createProvinceStubs(request);
    console.log(`create-province: created province ${province.id} "${province.name}"`);
    return province;
  });

  /**
   * Flush pending provinces — write deferred province entries to disk.
   * Called at save time when the user has pending (unsaved) provinces.
   */
  handleSave('flush-pending-provinces', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
    data: { provinces: PendingProvince[]; options: PendingSaveOptions }
  ) => {
    const manager = getManager(modPath);
    await manager.flushPendingProvinces(data.provinces, data.options);
    console.log(`flush-pending-provinces: wrote ${data.provinces.length} provinces`);
  });

  /**
   * Reconcile provinces — remove orphaned entries and remap IDs.
   * Called after user confirms the reconciliation dialog.
   */
  handleSave('reconcile-provinces', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
    data: ReconcileRequest
  ) => {
    const manager = getManager(modPath);
    await manager.reconcile(data);
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
  handleSave('save-draft', async (
    _event: IpcMainInvokeEvent,
    modPath: string,
    name: string,
    rgbaBuffer: Uint8Array,
    width: number,
    height: number,
    metadata: DraftSaveData,
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
