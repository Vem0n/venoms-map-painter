/** Type declaration for the preload API exposed on window.mapPainter */

import type { ProjectLibrary, SaveFailureContext, SaveFailureReport, LoadModResult, ProvinceData, CreateProvinceRequest, LandedTitleNode, ReconcileRequest, PendingProvince, PendingSaveOptions, DraftSaveData, DraftMetadata, DraftSummary, RGB } from './types';

interface MapPainterAPI {
  getProjectLibrary(): Promise<ProjectLibrary>;
  addWorkshopFolder(): Promise<ProjectLibrary | null>;
  rescanProjectLibrary(): Promise<ProjectLibrary>;
  removeWorkshopFolder(folder: string): Promise<ProjectLibrary>;

  reportSaveFailure(context: SaveFailureContext): Promise<SaveFailureReport>;
  selectDirectory(): Promise<string | null>;
  loadImage(modPath: string): Promise<{ buffer: Uint8Array; width: number; height: number }>;
  saveImage(modPath: string, rgbaBuffer: Uint8Array, width: number, height: number): Promise<void>;
  loadDefinitions(modPath: string): Promise<{ provinces: Array<{ id: number; color: { r: number; g: number; b: number }; name: string }>; error?: string }>;
  loadMod(modPath: string): Promise<LoadModResult>;
  getHierarchy(modPath: string, provinceId: number): Promise<LandedTitleNode[]>;
  saveMod(modPath: string, data: { provinces: ProvinceData[]; modifiedProvinceIds?: number[] }): Promise<void>;
  renameTitle(modPath: string, oldKey: string, newKey: string): Promise<boolean>;
  createProvince(modPath: string, data: CreateProvinceRequest): Promise<ProvinceData>;
  listHistoryFiles(modPath: string): Promise<string[]>;
  flushPendingProvinces(modPath: string, data: { provinces: PendingProvince[]; options: PendingSaveOptions }): Promise<void>;
  reconcileProvinces(modPath: string, data: ReconcileRequest): Promise<void>;
  saveDraft(
    modPath: string,
    name: string,
    rgbaBuffer: Uint8Array,
    width: number,
    height: number,
    metadata: DraftSaveData,
  ): Promise<void>;
  listDrafts(modPath: string): Promise<DraftSummary[]>;
  loadDraftImage(modPath: string, folderName: string): Promise<{ buffer: Uint8Array; width: number; height: number }>;
  loadDraftMetadata(modPath: string, folderName: string): Promise<DraftMetadata>;
  deleteDraft(modPath: string, folderName: string): Promise<void>;
  loadHeightmap(modPath: string): Promise<{ buffer: Uint8Array; width: number; height: number } | null>;
  onCheckBeforeClose(callback: () => void): () => void;
  confirmClose(): void;
}

declare global {
  interface Window {
    mapPainter: MapPainterAPI;
  }
}

export {};
