/** Pending province lifecycle: create, edit, delete (with pixel erasure), orphan detection, color remap */

import { useState, useCallback, useRef } from 'react';
import type { RGB, ProvinceData, CreateProvinceRequest, PendingProvince, PendingSaveOptions, UndoAction } from '@shared/types';
import { rgbToKey } from '@shared/types';
import { PendingProvinceMap } from '@registry/pending-province-map';
import type { EngineRef, RegistryRef, ToolManagerRef, UndoManagerRef, PendingMapRef } from './types';
import type { SidebarMode } from './types';

export interface UsePendingProvincesParams {
  engineRef: EngineRef;
  registryRef: RegistryRef;
  toolManagerRef: ToolManagerRef;
  undoManagerRef: UndoManagerRef;
  pendingMapRef: PendingMapRef;
  setStatus: (msg: string) => void;
  setDraftDirty: (dirty: boolean) => void;
  setModDirty: (dirty: boolean) => void;
  setModifiedProvinceIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  onColorChange: (color: RGB) => void;
  setSidebarMode: (mode: SidebarMode) => void;
  triggerForceUpdate: () => void;
}

export function usePendingProvinces({
  engineRef, registryRef, toolManagerRef, undoManagerRef, pendingMapRef,
  setStatus, setDraftDirty, setModDirty, setModifiedProvinceIds,
  onColorChange, setSidebarMode, triggerForceUpdate,
}: UsePendingProvincesParams) {
  const [pendingCount, setPendingCount] = useState(0);
  const [provinceCount, setProvinceCount] = useState(0);
  const [pendingSaveOptions, setPendingSaveOptions] = useState<PendingSaveOptions>({
    definitionCsv: true,
    historyStubs: true,
    landedTitles: true,
    terrainEntries: true,
  });
  const [showPendingOrphanDialog, setShowPendingOrphanDialog] = useState(false);
  const [pendingOrphans, setPendingOrphans] = useState<PendingProvince[]>([]);
  const [editingPendingKey, setEditingPendingKey] = useState<string | null>(null);
  const pendingOrphanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Check if any pending provinces lost all their pixels (after erase). Debounced. */
  const scheduleCheckPendingOrphans = useCallback(() => {
    if (pendingOrphanTimerRef.current) clearTimeout(pendingOrphanTimerRef.current);
    pendingOrphanTimerRef.current = setTimeout(async () => {
      const engine = engineRef.current;
      const pendingMap = pendingMapRef.current;
      if (!engine || pendingMap.count === 0) return;

      const orphaned: PendingProvince[] = [];
      for (const entry of pendingMap.getAll()) {
        const location = await engine.findColorLocationAsync(entry.color);
        if (!location) orphaned.push(entry);
      }

      if (orphaned.length > 0) {
        setPendingOrphans(orphaned);
        setShowPendingOrphanDialog(true);
      }
    }, 200);
  }, [engineRef, pendingMapRef]);

  const handleCreateProvince = useCallback(async (request: CreateProvinceRequest): Promise<ProvinceData | null> => {
    try {
      const registry = registryRef.current;
      const pendingMap = pendingMapRef.current;

      const province = registry.registerProvince({
        color: request.color,
        name: request.name,
        titleTier: request.titleTier,
        culture: request.culture,
        religion: request.religion,
        holding: request.holding,
        terrain: request.terrain,
        historyFile: request.historyFile,
      });

      const pendingEntry: PendingProvince = {
        id: province.id,
        color: province.color,
        name: province.name,
        request,
      };
      pendingMap.add(pendingEntry);

      setProvinceCount(registry.count);
      setPendingCount(pendingMap.count);

      try {
        const suggested = registry.suggestNextColor();
        onColorChange(suggested);
      } catch {
        // Exhausted colors, unlikely
      }

      setStatus(`Pending province #${province.id}: ${province.name}`);
      triggerForceUpdate();
      return province;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Create error: ${msg}`);
      return null;
    }
  }, [registryRef, pendingMapRef, onColorChange, setStatus, triggerForceUpdate]);

  const handleDeletePending = useCallback(async (colorKey: string) => {
    const engine = engineRef.current;
    const pendingMap = pendingMapRef.current;
    const registry = registryRef.current;
    const undoManager = undoManagerRef.current;
    const tm = toolManagerRef.current;
    const entry = pendingMap.get(colorKey);
    if (!entry || !engine || !engine.isLoaded()) return;

    try {
      setStatus(`Deleting province #${entry.id}...`);

      // 1. Get empty color to paint over erased pixels
      const emptyColor = tm ? tm.getEmptyColors()[0] : { r: 0, g: 0, b: 0 };

      // 2. Use sector manager to restrict scanning to relevant tiles
      const sm = registry.getSectorManager();
      const tileSubset = sm.isPopulated ? sm.getTilesForColors([colorKey]) : undefined;

      // 3. Find exact affected tiles for undo snapshots
      const colorKeySet = new Set([colorKey]);
      const affectedTileIndices = engine.findTilesWithColors(colorKeySet, tileSubset);

      // 4. Snapshot BEFORE
      const beforeSnapshots = new Map<number, Uint8ClampedArray>();
      for (const tileIdx of affectedTileIndices) {
        beforeSnapshots.set(tileIdx, engine.snapshotTile(tileIdx));
      }

      // 5. Erase pixels (replace province color with empty color)
      const result = await engine.replaceColorAsync(entry.color, emptyColor, tileSubset);

      // 6. Snapshot AFTER
      const afterSnapshots = new Map<number, Uint8ClampedArray>();
      for (const tileIdx of affectedTileIndices) {
        afterSnapshots.set(tileIdx, engine.snapshotTile(tileIdx));
      }

      // 7. Push undo action
      const action: UndoAction = {
        tileIndices: Array.from(affectedTileIndices),
        beforeSnapshots,
        afterSnapshots,
        description: `Delete pending province #${entry.id}: ${entry.name}`,
        pendingRemoved: [{ ...entry }],
      };
      undoManager.push(action);

      // 8. Remove from pending map + registry
      pendingMap.remove(colorKey);
      registry.removeProvince(entry.id);

      // 9. Rescan affected sectors
      if (sm.isPopulated && result.affectedTiles.size > 0) {
        sm.rescanByTiles(result.affectedTiles);
      }

      // 10. Reconcile remaining IDs to stay sequential
      const maxCommittedId = PendingProvinceMap.deriveMaxCommittedId(registry, pendingMap);
      const remaps = pendingMap.reconcileIds(maxCommittedId + 1);

      // Sync remapped IDs back to registry
      for (const { oldId, newId } of remaps) {
        const province = registry.getProvinceById(oldId);
        if (province) {
          province.id = newId;
        }
      }
      if (remaps.length > 0) {
        // Rebuild registry ID index after in-place mutations
        registry.applyIdRemap(new Map(remaps.map(r => [r.oldId, r.newId])));
      }

      // 11. Mark dirty
      setDraftDirty(true);
      setModDirty(true);

      // 12. Update React state
      setPendingCount(pendingMap.count);
      setProvinceCount(registry.count);
      triggerForceUpdate();

      setStatus(
        `Deleted province #${entry.id}: ${entry.name} — ${result.pixelCount.toLocaleString()} pixels erased`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Delete error: ${msg}`);
    }
  }, [engineRef, pendingMapRef, registryRef, undoManagerRef, toolManagerRef,
      setStatus, setDraftDirty, setModDirty, triggerForceUpdate]);

  const handlePendingOrphanConfirm = useCallback((removedColorKeys: string[]) => {
    const pendingMap = pendingMapRef.current;
    const removed: PendingProvince[] = [];

    for (const key of removedColorKeys) {
      const entry = pendingMap.get(key);
      if (entry) {
        pendingMap.remove(key);
        registryRef.current.removeProvince(entry.id);
        removed.push(entry);
      }
    }

    // Patch the most recent undo action with pendingRemoved so undo can restore them
    if (removed.length > 0) {
      const lastAction = toolManagerRef.current?.getLastUndoAction();
      if (lastAction) {
        lastAction.pendingRemoved = [
          ...(lastAction.pendingRemoved ?? []),
          ...removed,
        ];
      }
    }

    // Reconcile remaining IDs to stay sequential
    const registry = registryRef.current;
    const maxCommittedId = PendingProvinceMap.deriveMaxCommittedId(registry, pendingMap);
    const remaps = pendingMap.reconcileIds(maxCommittedId + 1);
    for (const { oldId, newId } of remaps) {
      const province = registry.getProvinceById(oldId);
      if (province) {
        province.id = newId;
      }
    }
    if (remaps.length > 0) {
      registry.applyIdRemap(new Map(remaps.map(r => [r.oldId, r.newId])));
    }

    setPendingCount(pendingMap.count);
    setProvinceCount(registry.count);
    setShowPendingOrphanDialog(false);
    setPendingOrphans([]);
    triggerForceUpdate();
    setStatus(`Removed ${removed.length} orphaned pending province(s)`);
  }, [pendingMapRef, registryRef, toolManagerRef, setStatus, triggerForceUpdate]);

  const handlePendingOrphanCancel = useCallback(() => {
    setShowPendingOrphanDialog(false);
    setPendingOrphans([]);
  }, []);

  const handleEditPending = useCallback((colorKey: string) => {
    setEditingPendingKey(colorKey);
    setSidebarMode('creator');
  }, [setSidebarMode]);

  const handleUpdatePending = useCallback((colorKey: string, request: CreateProvinceRequest) => {
    const pendingMap = pendingMapRef.current;
    const entry = pendingMap.get(colorKey);
    if (!entry) return;

    entry.name = request.name;
    entry.request = request;

    const province = registryRef.current.getProvinceByColor(entry.color);
    if (province) {
      province.name = request.name;
      province.culture = request.culture;
      province.religion = request.religion;
      province.holding = request.holding;
      province.terrain = request.terrain;
      province.titleTier = request.titleTier;
      province.historyFile = request.historyFile;
    }

    setEditingPendingKey(null);
    setStatus(`Updated pending province #${entry.id}: ${request.name}`);
    triggerForceUpdate();
  }, [pendingMapRef, registryRef, setStatus, triggerForceUpdate]);

  /**
   * Re-key a pending province entry when a tool changes its color.
   * Call this after `registry.updateProvinceColor()` has already remapped the registry.
   */
  const handleColorRemap = useCallback((oldColor: RGB, newColor: RGB) => {
    const pendingMap = pendingMapRef.current;
    const oldKey = rgbToKey(oldColor);
    if (!pendingMap.has(oldKey)) return; // not a pending province — nothing to do

    pendingMap.remapColor(oldKey, newColor);
    triggerForceUpdate();
  }, [pendingMapRef, triggerForceUpdate]);

  return {
    pendingCount, provinceCount, pendingSaveOptions,
    showPendingOrphanDialog, pendingOrphans, editingPendingKey,
    scheduleCheckPendingOrphans,
    handleCreateProvince, handleDeletePending,
    handlePendingOrphanConfirm, handlePendingOrphanCancel,
    handleEditPending, handleUpdatePending, handleColorRemap,
    setPendingCount, setProvinceCount, setPendingSaveOptions, setEditingPendingKey,
  };
}
