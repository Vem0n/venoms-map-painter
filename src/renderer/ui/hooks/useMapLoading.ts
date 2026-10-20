/** Map loading: Open Map workflow */

import { useState, useCallback, useRef } from 'react';
import type { RGB, ProvinceData, LandedTitleNode } from '@shared/types';
import type { EngineRef, RegistryRef, UndoManagerRef, PendingMapRef, ModPathRef, ToolManagerRef } from './types';

export interface UseMapLoadingParams {
  sourceDefinitionsRef: React.MutableRefObject<ProvinceData[] | null>;
  setTitleRenames: (renames: Array<{ oldKey: string; newKey: string }>) => void;
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
  sourceDefinitionsRef, setTitleRenames,
  engineRef, registryRef, undoManagerRef, pendingMapRef, modPathRef, toolManagerRef,
  setStatus, setLandedTitles, setModLoaded, setModDirty, setModifiedProvinceIds,
  setSelectedProvince, setHistoryFiles, setProvinceCount, setPendingCount,
  setHeightmapAvailable, setHeightmapVisible,
  setDraftDirty, setDraftLoadedName,
  onColorChange, triggerForceUpdate, guardUnsavedDraft,
}: UseMapLoadingParams) {
  const loadingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  const handleOpenMapAction = useCallback(async (selectedModPath?: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadingMessage('Selecting directory...');
    setStatus('Selecting directory...');

    try {
      const modPath = selectedModPath ?? await window.mapPainter.selectDirectory();
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

      // Read both essential inputs before replacing the current in-memory map.
      setLoadingMessage('Loading provinces.png...');
      const image = await window.mapPainter.loadImage(modPath);
      setLoadingMessage('Loading mod files...');
      const modResult = await window.mapPainter.loadMod(modPath);
      let provinces: ProvinceData[];
      if (!modResult.success || !modResult.data) {
        const definitions = await window.mapPainter.loadDefinitions(modPath);
        if (definitions.error) throw new Error(definitions.error);
        provinces = definitions.provinces as ProvinceData[];
        setLandedTitles([]);
        setModLoaded(false);
        setStatus(`Loaded map (${image.width}x${image.height}) — ${modResult.error ?? 'mod metadata unavailable'}`);
      } else {
        provinces = modResult.data.provinces;
        setLandedTitles(modResult.data.landedTitles);
        setModLoaded(true);
        setStatus(`Loaded ${image.width}x${image.height} map — ${provinces.length} provinces, ${modResult.data.landedTitles.length} title trees`);
      }
      const imgW = image.width;
      const imgH = image.height;
      engine.loadImage(image.buffer, imgW, imgH);
      undoManagerRef.current.clear();
      registryRef.current.loadFromDefinitions(provinces);
      setProvinceCount(provinces.length);
      sourceDefinitionsRef.current = structuredClone(provinces.map(({ id, color, name }) => ({ id, color, name })));
      setTitleRenames([]);

      modPathRef.current = modPath;
      setModDirty(false);
      setModifiedProvinceIds(new Set());
      setSelectedProvince(null);
      setDraftDirty(false);
      setDraftLoadedName(null);

      // Clear pending map
      pendingMapRef.current.clear();
      setPendingCount(0);

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

      // Fetch history file list
      setLoadingMessage('Loading history files...');
      try {
        const hFiles = await window.mapPainter.listHistoryFiles(modPath);
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
      loadingRef.current = false;
      setLoading(false);
      setLoadingMessage(null);
    }
  }, [
    sourceDefinitionsRef, setTitleRenames, loading, engineRef, registryRef, undoManagerRef, pendingMapRef, modPathRef, toolManagerRef,
    setStatus, setLandedTitles, setModLoaded, setModDirty, setModifiedProvinceIds,
    setSelectedProvince, setHistoryFiles, setProvinceCount, setPendingCount,
    setHeightmapAvailable, setHeightmapVisible,
    setDraftDirty, setDraftLoadedName, onColorChange, triggerForceUpdate,
  ]);

  const handleOpenMap = useCallback(() => {
    if (!guardUnsavedDraft(handleOpenMapAction)) return;
    handleOpenMapAction();
  }, [guardUnsavedDraft, handleOpenMapAction]);

  const handleOpenProject = useCallback((modPath: string) => {
    const action = () => { void handleOpenMapAction(modPath); };
    if (guardUnsavedDraft(action)) action();
  }, [handleOpenMapAction, guardUnsavedDraft]);

  return {
    loading, loadingMessage,
    handleOpenMapAction, handleOpenMap, handleOpenProject,
    setLoading, setLoadingMessage,
  };
}
