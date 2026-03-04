/** Province inspector state + mod file editing handlers */

import { useState, useCallback } from 'react';
import type { ProvinceData, LandedTitleNode } from '@shared/types';
import { MAX_ZOOM } from '@shared/constants';
import type { EngineRef, RegistryRef, ModPathRef } from './types';
import type { SidebarMode } from './types';

export interface UseProvinceInspectorParams {
  engineRef: EngineRef;
  registryRef: RegistryRef;
  modPathRef: ModPathRef;
  setStatus: (msg: string) => void;
  setDraftDirty: (dirty: boolean) => void;
  setZoomLevel: (zoom: number) => void;
}

export function useProvinceInspector({
  engineRef, registryRef, modPathRef,
  setStatus, setDraftDirty, setZoomLevel,
}: UseProvinceInspectorParams) {
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('painting');
  const [selectedProvince, setSelectedProvince] = useState<ProvinceData | null>(null);
  const [modLoaded, setModLoaded] = useState(false);
  const [modDirty, setModDirty] = useState(false);
  const [modifiedProvinceIds, setModifiedProvinceIds] = useState<Set<number>>(new Set());
  const [landedTitles, setLandedTitles] = useState<LandedTitleNode[]>([]);
  const [historyFiles, setHistoryFiles] = useState<string[]>([]);

  const handleProvinceClick = useCallback((gx: number, gy: number) => {
    const engine = engineRef.current;
    if (!engine || !engine.isLoaded()) return;

    const px = engine.getPixel(gx, gy);
    const province = registryRef.current.getProvinceByColor(px);
    setSelectedProvince(province || null);
  }, [engineRef, registryRef]);

  const handleProvinceEdit = useCallback((updated: ProvinceData) => {
    setSelectedProvince(updated);
    setModDirty(true);
    setDraftDirty(true);
    setModifiedProvinceIds(prev => new Set(prev).add(updated.id));

    const registry = registryRef.current;
    const existing = registry.getProvinceById(updated.id);
    if (existing) {
      Object.assign(existing, updated);
    }
  }, [registryRef, setDraftDirty]);

  const handleFetchHierarchy = useCallback(async (provinceId: number): Promise<LandedTitleNode[]> => {
    try {
      return await window.mapPainter.getHierarchy(provinceId);
    } catch {
      return [];
    }
  }, []);

  const handleTitleRename = useCallback(async (oldKey: string, newKey: string) => {
    try {
      const success = await window.mapPainter.renameTitle(oldKey, newKey);
      if (success) {
        setModDirty(true);
        setStatus(`Renamed title: ${oldKey} -> ${newKey}`);
      } else {
        setStatus(`Title not found: ${oldKey}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Rename error: ${msg}`);
    }
  }, [setStatus]);

  const handleSaveMod = useCallback(async () => {
    if (!modPathRef.current) return;

    try {
      setStatus('Saving mod files...');
      const provinces = registryRef.current.getAllProvinces();
      await window.mapPainter.saveMod({
        provinces,
        modifiedProvinceIds: Array.from(modifiedProvinceIds),
      });
      setModDirty(false);
      setModifiedProvinceIds(new Set());
      setStatus('Mod files saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Save error: ${msg}`);
    }
  }, [modPathRef, registryRef, modifiedProvinceIds, setStatus]);

  const handleJumpToProvince = useCallback(async (province: ProvinceData) => {
    const engine = engineRef.current;
    if (!engine || !engine.isLoaded()) return;

    setStatus(`Searching for province ${province.id}: ${province.name}...`);
    const location = await engine.findColorLocationAsync(province.color);
    if (!location) {
      setStatus(`Province "${province.name}" has no pixels on the map`);
      return;
    }

    engine.centerOn(location.gx, location.gy, MAX_ZOOM);
    setZoomLevel(engine.getZoom());
    setStatus(`Jumped to province ${province.id}: ${province.name}`);
  }, [engineRef, setStatus, setZoomLevel]);

  return {
    sidebarMode, selectedProvince, modLoaded, modDirty,
    modifiedProvinceIds, landedTitles, historyFiles,
    handleProvinceClick, handleProvinceEdit, handleFetchHierarchy,
    handleTitleRename, handleSaveMod, handleJumpToProvince,
    setSidebarMode, setSelectedProvince, setModLoaded, setModDirty,
    setModifiedProvinceIds, setLandedTitles, setHistoryFiles,
  };
}
