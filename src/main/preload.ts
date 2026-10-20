/**
 * Preload script — Exposes a safe IPC bridge to the renderer via contextBridge.
 *
 * The renderer can call `window.mapPainter.loadImage(path)` etc.
 * without direct access to Node.js or Electron APIs.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ProjectLibrary, SaveFailureContext, SaveFailureReport } from '@shared/types';

const api = {
  getProjectLibrary: (): Promise<ProjectLibrary> => ipcRenderer.invoke('get-project-library'),
  addWorkshopFolder: (): Promise<ProjectLibrary | null> => ipcRenderer.invoke('add-workshop-folder'),
  rescanProjectLibrary: (): Promise<ProjectLibrary> => ipcRenderer.invoke('rescan-project-library'),
  removeWorkshopFolder: (folder: string): Promise<ProjectLibrary> => ipcRenderer.invoke('remove-workshop-folder', folder),

  reportSaveFailure: (context: SaveFailureContext): Promise<SaveFailureReport> =>
    ipcRenderer.invoke('report-save-failure', context),

  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('select-directory'),

  loadImage: (modPath: string): Promise<{ buffer: Uint8Array; width: number; height: number }> =>
    ipcRenderer.invoke('load-image', modPath),

  saveImage: (modPath: string, rgbaBuffer: Uint8Array, width: number, height: number): Promise<void> =>
    ipcRenderer.invoke('save-image', modPath, rgbaBuffer, width, height),

  loadDefinitions: (modPath: string): Promise<{ provinces: Array<{ id: number; color: { r: number; g: number; b: number }; name: string }>; error?: string }> =>
    ipcRenderer.invoke('load-definitions', modPath),

  loadMod: (modPath: string): Promise<unknown> =>
    ipcRenderer.invoke('load-mod', modPath),

  getHierarchy: (modPath: string, provinceId: number): Promise<unknown> =>
    ipcRenderer.invoke('get-hierarchy', modPath, provinceId),

  saveMod: (modPath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('save-mod', modPath, data),

  renameTitle: (modPath: string, oldKey: string, newKey: string): Promise<boolean> =>
    ipcRenderer.invoke('rename-title', modPath, oldKey, newKey),

  createProvince: (modPath: string, data: unknown): Promise<unknown> =>
    ipcRenderer.invoke('create-province', modPath, data),

  listHistoryFiles: (modPath: string): Promise<string[]> =>
    ipcRenderer.invoke('list-history-files', modPath),

  flushPendingProvinces: (modPath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('flush-pending-provinces', modPath, data),

  reconcileProvinces: (modPath: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('reconcile-provinces', modPath, data),

  saveDraft: (
    modPath: string,
    name: string,
    rgbaBuffer: Uint8Array,
    width: number,
    height: number,
    metadata: unknown,
  ): Promise<void> =>
    ipcRenderer.invoke('save-draft', modPath, name, rgbaBuffer, width, height, metadata),

  listDrafts: (modPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke('list-drafts', modPath),

  loadDraftImage: (modPath: string, folderName: string): Promise<{ buffer: Uint8Array; width: number; height: number }> =>
    ipcRenderer.invoke('load-draft-image', modPath, folderName),

  loadDraftMetadata: (modPath: string, folderName: string): Promise<unknown> =>
    ipcRenderer.invoke('load-draft-metadata', modPath, folderName),

  deleteDraft: (modPath: string, folderName: string): Promise<void> =>
    ipcRenderer.invoke('delete-draft', modPath, folderName),

  loadHeightmap: (modPath: string): Promise<{ buffer: Uint8Array; width: number; height: number } | null> =>
    ipcRenderer.invoke('load-heightmap', modPath),

  /** Register a callback for when the main process asks if we can close */
  onCheckBeforeClose: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('check-before-close', handler);
    return () => { ipcRenderer.removeListener('check-before-close', handler); };
  },

  /** Tell the main process it's OK to close the window */
  confirmClose: (): void => {
    ipcRenderer.send('confirm-close');
  },
};

contextBridge.exposeInMainWorld('mapPainter', api);

export type MapPainterAPI = typeof api;
