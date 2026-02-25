/**
 * Preload script — Exposes a safe IPC bridge to the renderer via contextBridge.
 *
 * The renderer can call `window.mapPainter.loadImage(path)` etc.
 * without direct access to Node.js or Electron APIs.
 */

import { contextBridge, ipcRenderer } from 'electron';

const api = {
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

  getHierarchy: (provinceId: number): Promise<unknown> =>
    ipcRenderer.invoke('get-hierarchy', provinceId),

  saveMod: (data: unknown): Promise<void> =>
    ipcRenderer.invoke('save-mod', data),

  renameTitle: (oldKey: string, newKey: string): Promise<boolean> =>
    ipcRenderer.invoke('rename-title', oldKey, newKey),

  createProvince: (data: unknown): Promise<unknown> =>
    ipcRenderer.invoke('create-province', data),

  listHistoryFiles: (): Promise<string[]> =>
    ipcRenderer.invoke('list-history-files'),

  reconcileProvinces: (data: unknown): Promise<void> =>
    ipcRenderer.invoke('reconcile-provinces', data),
};

contextBridge.exposeInMainWorld('mapPainter', api);

export type MapPainterAPI = typeof api;
