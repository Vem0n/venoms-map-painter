/** Draft save/load: save draft dialog, load draft flow, unsaved changes guard */

import { useState, useCallback, useRef } from 'react';
import type { RGB, ProvinceData, LandedTitleNode, PendingSaveOptions, DraftSummary, DraftMetadata } from '@shared/types';
import type { EngineRef, RegistryRef, ToolManagerRef, UndoManagerRef, PendingMapRef, ModPathRef } from './types';

export interface UseDraftSaveLoadParams {
  engineRef: EngineRef;
  registryRef: RegistryRef;
  toolManagerRef: ToolManagerRef;
  undoManagerRef: UndoManagerRef;
  pendingMapRef: PendingMapRef;
  modPathRef: ModPathRef;
  setStatus: (msg: string) => void;
  // State from other hooks
  pendingSaveOptions: PendingSaveOptions;
  emptyColors: RGB[];
  lockedColor: RGB | null;
  loading: boolean;
  // Setters for restored state
  setLoading: (loading: boolean) => void;
  setLoadingMessage: (msg: string | null) => void;
  setLandedTitles: (titles: LandedTitleNode[]) => void;
  setModLoaded: (loaded: boolean) => void;
  setModDirty: (dirty: boolean) => void;
  setModifiedProvinceIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  setSelectedProvince: (province: ProvinceData | null) => void;
  setHistoryFiles: (files: string[]) => void;
  setPendingCount: (count: number) => void;
  setProvinceCount: (count: number) => void;
  setPendingSaveOptions: (options: PendingSaveOptions) => void;
  setEmptyColors: (colors: RGB[]) => void;
  setLockedColor: (color: RGB | null) => void;
  setHeightmapAvailable: (available: boolean) => void;
  setHeightmapVisible: (visible: boolean) => void;
  onColorChange: (color: RGB) => void;
  triggerForceUpdate: () => void;
}

export function useDraftSaveLoad({
  engineRef, registryRef, toolManagerRef, undoManagerRef, pendingMapRef, modPathRef,
  setStatus, pendingSaveOptions, emptyColors, lockedColor, loading,
  setLoading, setLoadingMessage, setLandedTitles, setModLoaded, setModDirty, setModifiedProvinceIds,
  setSelectedProvince, setHistoryFiles, setPendingCount, setProvinceCount,
  setPendingSaveOptions, setEmptyColors, setLockedColor,
  setHeightmapAvailable, setHeightmapVisible,
  onColorChange, triggerForceUpdate,
}: UseDraftSaveLoadParams) {
  const [showSaveDraftDialog, setShowSaveDraftDialog] = useState(false);
  const [showDraftListDialog, setShowDraftListDialog] = useState(false);
  const [showUnsavedDraftDialog, setShowUnsavedDraftDialog] = useState(false);
  const [draftList, setDraftList] = useState<DraftSummary[]>([]);
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftLoadedName, setDraftLoadedName] = useState<string | null>(null);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const draftDirtyRef = useRef(draftDirty);
  draftDirtyRef.current = draftDirty;

  /** Quick-save draft with a given name */
  const performDraftSave = useCallback(async (name: string) => {
    const engine = engineRef.current;
    if (!modPathRef.current || !engine || !engine.isLoaded()) return;

    setStatus('Saving draft...');
    const rgbaBuffer = new Uint8Array(engine.stitchFullImage().buffer);
    const { width, height } = engine.getMapSize();

    await window.mapPainter.saveDraft(
      modPathRef.current,
      name,
      rgbaBuffer,
      width,
      height,
      {
        pendingProvinces: pendingMapRef.current.getAll(),
        pendingSaveOptions,
        emptyColors,
        lockedColor,
      },
    );

    setDraftDirty(false);
    setDraftLoadedName(name);
    setStatus(`Draft saved: "${name}"`);
  }, [engineRef, modPathRef, pendingMapRef, pendingSaveOptions, emptyColors, lockedColor, setStatus]);

  const handleSaveDraft = useCallback(() => {
    const engine = engineRef.current;
    if (!modPathRef.current || !engine || !engine.isLoaded()) {
      setStatus('Nothing to save — load a map first');
      return;
    }
    setShowSaveDraftDialog(true);
  }, [engineRef, modPathRef, setStatus]);

  const handleSaveDraftConfirm = useCallback(async (name: string) => {
    setShowSaveDraftDialog(false);
    try {
      await performDraftSave(name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Draft save error: ${msg}`);
    }
  }, [performDraftSave, setStatus]);

  const handleSaveDraftCancel = useCallback(() => {
    setShowSaveDraftDialog(false);
  }, []);

  /**
   * Guard against unsaved draft changes before a destructive action.
   * Returns true if the action can proceed immediately (not dirty).
   */
  const guardUnsavedDraft = useCallback((action: () => void): boolean => {
    if (!draftDirty) return true;
    pendingNavigationRef.current = action;
    setShowUnsavedDraftDialog(true);
    return false;
  }, [draftDirty]);

  const handleUnsavedSave = useCallback(async () => {
    setShowUnsavedDraftDialog(false);
    try {
      const name = draftLoadedName || 'Auto-save';
      await performDraftSave(name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Draft save error: ${msg}`);
    }
    const action = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (action) action();
  }, [draftLoadedName, performDraftSave, setStatus]);

  const handleUnsavedDiscard = useCallback(() => {
    setShowUnsavedDraftDialog(false);
    setDraftDirty(false);
    const action = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (action) action();
  }, []);

  const handleUnsavedCancel = useCallback(() => {
    setShowUnsavedDraftDialog(false);
    pendingNavigationRef.current = null;
  }, []);

  /** Load a specific draft after mod is already selected */
  const performDraftLoad = useCallback(async (modPath: string, folderName: string) => {
    setLoading(true);
    setLoadingMessage('Loading mod files...');

    try {
      const engine = engineRef.current;
      if (!engine) {
        setStatus('Engine not initialized');
        setLoading(false);
        setLoadingMessage(null);
        return;
      }

      // 1. Load mod data
      setLoadingMessage('Loading mod files...');
      setStatus('Loading mod files...');
      const modResult = await window.mapPainter.loadMod(modPath) as { success: boolean; data?: { provinces: ProvinceData[]; landedTitles: LandedTitleNode[] }; error?: string };

      if (!modResult.success || !modResult.data) {
        setStatus(`Mod load error: ${modResult.error || 'Unknown'}`);
        setLoading(false);
        setLoadingMessage(null);
        return;
      }

      // 2. Load draft metadata
      setLoadingMessage('Loading draft metadata...');
      setStatus('Loading draft metadata...');
      const metadata = await window.mapPainter.loadDraftMetadata(modPath, folderName) as DraftMetadata;

      // 3. Load draft image
      setLoadingMessage('Loading draft image...');
      setStatus('Loading draft image...');
      {
        const { buffer, width, height } = await window.mapPainter.loadDraftImage(modPath, folderName);

        if (width !== metadata.mapWidth || height !== metadata.mapHeight) {
          setStatus(`Draft dimension mismatch: expected ${metadata.mapWidth}x${metadata.mapHeight}, got ${width}x${height}`);
          setLoading(false);
          setLoadingMessage(null);
          return;
        }

        engine.loadImage(buffer, width, height);
      }

      // 4. Populate registry from mod data
      registryRef.current.loadFromDefinitions(modResult.data.provinces);
      setLandedTitles(modResult.data.landedTitles);
      setModLoaded(true);
      modPathRef.current = modPath;

      // 5. Restore pending provinces
      const pendingMap = pendingMapRef.current;
      pendingMap.clear();
      for (const entry of metadata.pendingProvinces) {
        pendingMap.add(entry);
        registryRef.current.addProvince({
          id: entry.id,
          color: entry.color,
          name: entry.name,
          titleTier: entry.request.titleTier,
          culture: entry.request.culture,
          religion: entry.request.religion,
          holding: entry.request.holding,
          terrain: entry.request.terrain,
          historyFile: entry.request.historyFile,
          isNew: true,
        });
      }
      setPendingCount(pendingMap.count);
      setProvinceCount(registryRef.current.count);

      // 6. Populate sector spatial index
      setLoadingMessage('Building spatial index...');
      {
        const { tilesX, tilesY } = engine.getTileGridSize();
        registryRef.current.initSectors(
          metadata.mapWidth, metadata.mapHeight, tilesX, tilesY,
          (idx) => engine.getTileBuffer(idx),
        );
        await registryRef.current.populateSectorsAsync((scanned, total) => {
          setLoadingMessage(`Populating sectors... ${scanned}/${total}`);
        });
      }

      // 7. Restore UI state
      setPendingSaveOptions(metadata.pendingSaveOptions);
      setEmptyColors(metadata.emptyColors);
      setLockedColor(metadata.lockedColor);
      const tm = toolManagerRef.current;
      if (tm) {
        const currentEmpty = tm.getEmptyColors();
        for (const c of currentEmpty) tm.removeEmptyColor(c);
        for (const c of metadata.emptyColors) tm.addEmptyColor(c);
        tm.setLockedColor(metadata.lockedColor);
      }

      // 8. Clear undo history + dirty flags
      undoManagerRef.current.clear();
      setModDirty(false);
      setModifiedProvinceIds(new Set());
      setSelectedProvince(null);
      setDraftDirty(false);
      setDraftLoadedName(metadata.name);

      // 9. Fetch history files
      setLoadingMessage('Loading history files...');
      try {
        const hFiles = await window.mapPainter.listHistoryFiles();
        setHistoryFiles(hFiles);
      } catch {
        setHistoryFiles([]);
      }

      // 10. Try to load heightmap overlay
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

      // 11. Suggest next color
      try {
        const suggested = registryRef.current.suggestNextColor();
        onColorChange(suggested);
      } catch { /* exhausted */ }

      triggerForceUpdate();
      setStatus(`Loaded draft: "${metadata.name}" (${metadata.mapWidth}x${metadata.mapHeight})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Draft load error: ${msg}`);
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  }, [
    engineRef, registryRef, toolManagerRef, undoManagerRef, pendingMapRef, modPathRef,
    setStatus, setLoading, setLoadingMessage, setLandedTitles, setModLoaded, setModDirty, setModifiedProvinceIds,
    setSelectedProvince, setHistoryFiles, setPendingCount, setProvinceCount,
    setPendingSaveOptions, setEmptyColors, setLockedColor,
    setHeightmapAvailable, setHeightmapVisible, onColorChange, triggerForceUpdate,
  ]);

  /** "Load Draft" button — pick mod dir, scan drafts, show picker */
  const handleLoadDraftAction = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setStatus('Selecting mod directory for draft...');

    try {
      const modPath = await window.mapPainter.selectDirectory();
      if (!modPath) {
        setStatus('No directory selected');
        setLoading(false);
        return;
      }

      setStatus('Scanning for drafts...');
      const drafts = await window.mapPainter.listDrafts(modPath) as DraftSummary[];

      if (drafts.length === 0) {
        setStatus('No drafts found in this mod directory');
        setLoading(false);
        return;
      }

      modPathRef.current = modPath;
      setDraftList(drafts);
      setShowDraftListDialog(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [loading, modPathRef, setStatus, setLoading]);

  const handleLoadDraft = useCallback(() => {
    if (!guardUnsavedDraft(handleLoadDraftAction)) return;
    handleLoadDraftAction();
  }, [guardUnsavedDraft, handleLoadDraftAction]);

  const handleDraftSelected = useCallback((folderName: string) => {
    setShowDraftListDialog(false);
    setDraftList([]);
    const modPath = modPathRef.current;
    if (modPath) performDraftLoad(modPath, folderName);
  }, [modPathRef, performDraftLoad]);

  const handleDraftDelete = useCallback(async (folderName: string) => {
    const modPath = modPathRef.current;
    if (!modPath) return;

    try {
      await window.mapPainter.deleteDraft(modPath, folderName);
      setDraftList(prev => prev.filter(d => d.folderName !== folderName));
      setStatus('Draft deleted');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Delete error: ${msg}`);
    }
  }, [modPathRef, setStatus]);

  const handleDraftListCancel = useCallback(() => {
    setShowDraftListDialog(false);
    setDraftList([]);
  }, []);

  return {
    showSaveDraftDialog, showDraftListDialog, showUnsavedDraftDialog,
    draftList, draftDirty, draftLoadedName,
    performDraftSave, handleSaveDraft, handleSaveDraftConfirm, handleSaveDraftCancel,
    guardUnsavedDraft,
    handleUnsavedSave, handleUnsavedDiscard, handleUnsavedCancel,
    performDraftLoad, handleLoadDraftAction, handleLoadDraft,
    handleDraftSelected, handleDraftDelete, handleDraftListCancel,
    setDraftDirty, setDraftLoadedName,
    draftDirtyRef, pendingNavigationRef,
  };
}
