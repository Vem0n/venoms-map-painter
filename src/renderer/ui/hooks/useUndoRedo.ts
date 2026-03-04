/** Undo/redo state + pending province sync on undo/redo */

import { useState, useCallback } from 'react';
import type { RGB, ProvinceData, PendingProvince } from '@shared/types';
import { rgbToKey } from '@shared/types';
import type { ToolManagerRef, PendingMapRef, RegistryRef, UndoManagerRef } from './types';

export interface UseUndoRedoParams {
  toolManagerRef: ToolManagerRef;
  pendingMapRef: PendingMapRef;
  registryRef: RegistryRef;
  undoManagerRef: UndoManagerRef;
  setStatus: (msg: string) => void;
  setPendingCount: (count: number) => void;
  setProvinceCount: (count: number) => void;
}

export function useUndoRedo({
  toolManagerRef, pendingMapRef, registryRef, undoManagerRef,
  setStatus, setPendingCount, setProvinceCount,
}: UseUndoRedoParams) {
  const [, forceUpdate] = useState(0);

  const triggerForceUpdate = useCallback(() => {
    forceUpdate(n => n + 1);
  }, []);

  /** Convert a PendingProvince to ProvinceData for ColorRegistry */
  const pendingToProvinceData = useCallback((entry: PendingProvince): ProvinceData => ({
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
  }), []);

  /** Sync pending map + registry after undo/redo action */
  const syncPendingFromAction = useCallback((
    action: { pendingRemoved?: PendingProvince[]; pendingAdded?: PendingProvince[]; colorRemaps?: [RGB, RGB][] },
    isUndo: boolean,
  ) => {
    const pendingMap = pendingMapRef.current;
    const registry = registryRef.current;
    let changed = false;

    const toRestore = isUndo ? action.pendingRemoved : action.pendingAdded;
    const toRemove = isUndo ? action.pendingAdded : action.pendingRemoved;

    if (toRestore) {
      for (const entry of toRestore) {
        if (!pendingMap.has(rgbToKey(entry.color))) {
          pendingMap.add(entry);
          registry.addProvince(pendingToProvinceData(entry));
          changed = true;
        }
      }
    }

    if (toRemove) {
      for (const entry of toRemove) {
        const key = rgbToKey(entry.color);
        if (pendingMap.has(key)) {
          pendingMap.remove(key);
          registry.removeProvince(entry.id);
          changed = true;
        }
      }
    }

    // Reverse or reapply color remaps from harmonize
    if (action.colorRemaps) {
      for (const [oldColor, newColor] of action.colorRemaps) {
        const fromColor = isUndo ? newColor : oldColor;
        const toColor = isUndo ? oldColor : newColor;

        // Update registry (also remaps SectorManager keys)
        registry.updateProvinceColor(fromColor, toColor);

        // Sync pending map if this color was pending
        const fromKey = rgbToKey(fromColor);
        if (pendingMap.has(fromKey)) {
          pendingMap.remapColor(fromKey, toColor);
        }
      }
    }

    if (changed) {
      setPendingCount(pendingMap.count);
      setProvinceCount(registry.count);
    }
  }, [pendingMapRef, registryRef, pendingToProvinceData, setPendingCount, setProvinceCount]);

  /** Rescan affected tiles in SectorManager after tile snapshots are restored */
  const rescanAfterRestore = useCallback((action: { tileIndices: number[] }) => {
    const sm = registryRef.current.getSectorManager();
    if (sm.isPopulated) {
      sm.rescanByTiles(action.tileIndices);
    }
  }, [registryRef]);

  const handleUndo = useCallback(() => {
    const action = toolManagerRef.current?.undo();
    if (action) {
      rescanAfterRestore(action);
      syncPendingFromAction(action, true);
      triggerForceUpdate();

      const restoredCount = action.pendingRemoved?.length ?? 0;
      const removedCount = action.pendingAdded?.length ?? 0;
      if (restoredCount > 0) {
        setStatus(`Undo — restored ${restoredCount} pending province(s)`);
      } else if (removedCount > 0) {
        setStatus(`Undo — removed ${removedCount} pending province(s)`);
      } else {
        setStatus('Undo');
      }
    }
  }, [toolManagerRef, rescanAfterRestore, syncPendingFromAction, triggerForceUpdate, setStatus]);

  const handleRedo = useCallback(() => {
    const action = toolManagerRef.current?.redo();
    if (action) {
      rescanAfterRestore(action);
      syncPendingFromAction(action, false);
      triggerForceUpdate();

      const restoredCount = action.pendingAdded?.length ?? 0;
      const removedCount = action.pendingRemoved?.length ?? 0;
      if (removedCount > 0) {
        setStatus(`Redo — removed ${removedCount} pending province(s)`);
      } else if (restoredCount > 0) {
        setStatus(`Redo — restored ${restoredCount} pending province(s)`);
      } else {
        setStatus('Redo');
      }
    }
  }, [toolManagerRef, rescanAfterRestore, syncPendingFromAction, triggerForceUpdate, setStatus]);

  return {
    handleUndo, handleRedo, syncPendingFromAction, pendingToProvinceData,
    triggerForceUpdate,
  };
}
