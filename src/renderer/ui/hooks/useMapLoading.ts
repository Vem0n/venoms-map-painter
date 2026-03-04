/** Map loading: Open Map workflow */

import { useState, useCallback } from 'react';
import type { RGB, ProvinceData, LandedTitleNode } from '@shared/types';
import type { EngineRef, RegistryRef, UndoManagerRef, PendingMapRef, ModPathRef, ToolManagerRef } from './types';

export interface UseMapLoadingParams {
  engineRef: EngineRef;
  registryRef: RegistryRef;
  undoManagerRef: UndoManagerRef;
  pendingMapRef: PendingMapRef;
  modPathRef: ModPathRef;
  toolManagerRef: ToolManagerRef;
  setStatus: (msg: string) => void;
  setLandedTitles: (titles: LandedTitleNode[]) => void;
  setModLoaded: (loaded: boolean) => void;
  setModDirty: (dirty: boolean) => void;
  setModifiedProvinceIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  setSelectedProvince: (province: ProvinceData | null) => void;
  setHistoryFiles: (files: string[]) => void;
  setProvinceCount: (count: number) => void;
  setPendingCount: (count: number) => void;
  setHeightmapAvailable: (available: boolean) => void;
  setHeightmapVisible: (visible: boolean) => void;
  setDraftDirty: (dirty: boolean) => void;
  setDraftLoadedName: (name: string | null) => void;
  onColorChange: (color: RGB) => void;
  triggerForceUpdate: () => void;
  guardUnsavedDraft: (action: () => void) => boolean;
}

export function useMapLoading({
  engineRef, registryRef, undoManagerRef, pendingMapRef, modPathRef, toolManagerRef,
  setStatus, setLandedTitles, setModLoaded, setModDirty, setModifiedProvinceIds,
  setSelectedProvince, setHistoryFiles, setProvinceCount, setPendingCount,
  setHeightmapAvailable, setHeightmapVisible,
  setDraftDirty, setDraftLoadedName,
  onColorChange, triggerForceUpdate, guardUnsavedDraft,
}: UseMapLoadingParams) {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  const handleOpenMapAction = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setLoadingMessage('Selecting directory...');
    setStatus('Selecting directory...');

    try {
      const modPath = await window.mapPainter.selectDirectory();
      if (!modPath) {
        setStatus('No directory selected');
        setLoading(false);
        setLoadingMessage(null);
        return;
      }

      const engine = engineRef.current;
      if (!engine) {
        setStatus('Engine not initialized');
        setLoading(false);
        setLoadingMessage(null);
        return;
      }

      // Load the image
      setLoadingMessage('Loading provinces.png...');
      setStatus('Loading provinces.png...');
      let imgW: number;
      let imgH: number;
      {
        const { buffer, width, height } = await window.mapPainter.loadImage(modPath);
        imgW = width;
        imgH = height;
        engine.loadImage(buffer, width, height);
      }

      // Clear undo history
      undoManagerRef.current.clear();

      // Load full mod
      setLoadingMessage('Loading mod files...');
      setStatus('Loading mod files...');
      const modResult = await window.mapPainter.loadMod(modPath);

      if (!modResult.success || !modResult.data) {
        const errMsg = modResult.error || 'Unknown error';
        console.warn('load-mod warning:', errMsg);
        setStatus(`Loaded map (${imgW}x${imgH}) — ${errMsg}`);

        const defResult = await window.mapPainter.loadDefinitions(modPath);
        if (!defResult.error) {
          registryRef.current.loadFromDefinitions(defResult.provinces as ProvinceData[]);
          setProvinceCount(registryRef.current.count);
        }
      } else {
        registryRef.current.loadFromDefinitions(modResult.data.provinces);
        setProvinceCount(registryRef.current.count);
        setLandedTitles(modResult.data.landedTitles);
        const titleCount = modResult.data.landedTitles.length;
        setStatus(`Loaded ${imgW}x${imgH} map — ${registryRef.current.count} provinces, ${titleCount} title trees`);
        setModLoaded(true);
      }

      // Populate sector spatial index
      setLoadingMessage('Building spatial index...');
      {
        const { tilesX, tilesY } = engine.getTileGridSize();
        registryRef.current.initSectors(
          imgW, imgH, tilesX, tilesY,
          (idx) => engine.getTileBuffer(idx),
        );
        await registryRef.current.populateSectorsAsync((scanned, total) => {
          setLoadingMessage(`Populating sectors... ${scanned}/${total}`);
        });
      }

      modPathRef.current = modPath;
      setModDirty(false);
      setModifiedProvinceIds(new Set());
      setSelectedProvince(null);
      setDraftDirty(false);
      setDraftLoadedName(null);

      // Clear pending map
      pendingMapRef.current.clear();
      setPendingCount(0);

      // Fetch history file list
      setLoadingMessage('Loading history files...');
      try {
        const hFiles = await window.mapPainter.listHistoryFiles();
        setHistoryFiles(hFiles);
      } catch {
        setHistoryFiles([]);
      }

      // Try to load heightmap overlay
      setLoadingMessage('Loading heightmap...');
      setHeightmapAvailable(false);
      setHeightmapVisible(false);
      try {
        const hm = await window.mapPainter.loadHeightmap(modPath);
        if (hm && engine) {
          engine.loadHeightmap(hm.buffer, hm.width, hm.height);
          setHeightmapAvailable(true);
        }
      } catch {
        // Heightmap not available
      }

      // Suggest a unique color
      try {
        const suggested = registryRef.current.suggestNextColor();
        onColorChange(suggested);
      } catch {
        // Registry might be empty
      }

      triggerForceUpdate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      console.error('Failed to load map:', err);
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  }, [
    loading, engineRef, registryRef, undoManagerRef, pendingMapRef, modPathRef, toolManagerRef,
    setStatus, setLandedTitles, setModLoaded, setModDirty, setModifiedProvinceIds,
    setSelectedProvince, setHistoryFiles, setProvinceCount, setPendingCount,
    setHeightmapAvailable, setHeightmapVisible,
    setDraftDirty, setDraftLoadedName, onColorChange, triggerForceUpdate,
  ]);

  const handleOpenMap = useCallback(() => {
    if (!guardUnsavedDraft(handleOpenMapAction)) return;
    handleOpenMapAction();
  }, [guardUnsavedDraft, handleOpenMapAction]);

  return {
    loading, loadingMessage,
    handleOpenMapAction, handleOpenMap,
    setLoading, setLoadingMessage,
  };
}
