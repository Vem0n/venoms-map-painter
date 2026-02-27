/** Type declaration for the preload API exposed on window.mapPainter */

import type { LoadModResult, ProvinceData, CreateProvinceRequest, LandedTitleNode, ReconcileRequest, PendingProvince, PendingSaveOptions } from './types';

interface MapPainterAPI {
  selectDirectory(): Promise<string | null>;
  loadImage(modPath: string): Promise<{ buffer: Uint8Array; width: number; height: number }>;
  saveImage(modPath: string, rgbaBuffer: Uint8Array, width: number, height: number): Promise<void>;
  loadDefinitions(modPath: string): Promise<{ provinces: Array<{ id: number; color: { r: number; g: number; b: number }; name: string }>; error?: string }>;
  loadMod(modPath: string): Promise<LoadModResult>;
  getHierarchy(provinceId: number): Promise<LandedTitleNode[]>;
  saveMod(data: { provinces: ProvinceData[]; modifiedProvinceIds?: number[] }): Promise<void>;
  renameTitle(oldKey: string, newKey: string): Promise<boolean>;
  createProvince(data: CreateProvinceRequest): Promise<ProvinceData>;
  listHistoryFiles(): Promise<string[]>;
  flushPendingProvinces(data: { provinces: PendingProvince[]; options: PendingSaveOptions }): Promise<void>;
  reconcileProvinces(data: ReconcileRequest): Promise<void>;
}

declare global {
  interface Window {
    mapPainter: MapPainterAPI;
  }
}

export {};
