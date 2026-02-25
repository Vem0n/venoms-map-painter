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
import type { ProvinceData, CreateProvinceRequest } from '@shared/types';

/** Active ModFileManager instance — created on load-mod, reused for save/create */
let activeManager: ModFileManager | null = null;

/**
 * Back up provinces.png to a map_backup/ folder before we touch anything.
 * Creates the folder if it doesn't exist. Uses a timestamp so multiple
 * sessions never overwrite each other's backups.
 */
async function backupOriginalMap(modPath: string): Promise<string> {
  const srcPath = path.join(modPath, 'map_data', 'provinces.png');
  const backupDir = path.join(modPath, 'map_backup');

  await fs.mkdir(backupDir, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const backupName = `provinces_${stamp}.png`;
  const backupPath = path.join(backupDir, backupName);

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
}
