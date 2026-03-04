/** Save + reconciliation: flush pending, save image + mod files, orphan reconciliation dialog */

import { useState, useCallback, useRef } from 'react';
import type { ProvinceData, LandedTitleNode, PendingSaveOptions } from '@shared/types';
import { rgbToKey } from '@shared/types';
import { detectOrphans, buildIdRemap } from '../../reconciliation/reconcile';
import type { OrphanedParent } from '../../reconciliation/reconcile';
import { PendingProvinceMap } from '@registry/pending-province-map';
import type { EngineRef, RegistryRef, PendingMapRef, ModPathRef } from './types';

export interface UseSaveReconciliationParams {
  engineRef: EngineRef;
  registryRef: RegistryRef;
  pendingMapRef: PendingMapRef;
  modPathRef: ModPathRef;
  modifiedProvinceIds: Set<number>;
  landedTitles: LandedTitleNode[];
  pendingSaveOptions: PendingSaveOptions;
  setStatus: (msg: string) => void;
  setDraftDirty: (dirty: boolean) => void;
  setModDirty: (dirty: boolean) => void;
  setModifiedProvinceIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  setPendingCount: (count: number) => void;
  setProvinceCount: (count: number) => void;
}

export function useSaveReconciliation({
  engineRef, registryRef, pendingMapRef, modPathRef,
  modifiedProvinceIds, landedTitles, pendingSaveOptions,
  setStatus, setDraftDirty, setModDirty, setModifiedProvinceIds,
  setPendingCount, setProvinceCount,
}: UseSaveReconciliationParams) {
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [reconcileOrphans, setReconcileOrphans] = useState<ProvinceData[]>([]);
  const [reconcileParents, setReconcileParents] = useState<OrphanedParent[]>([]);

  // ID drift detection state
  const [showDriftDialog, setShowDriftDialog] = useState(false);
  const [driftRemaps, setDriftRemaps] = useState<Array<{ oldId: number; newId: number }>>([]);
  const [pendingDriftSave, setPendingDriftSave] = useState<(() => Promise<void>) | null>(null);

  // Save mutex — prevents concurrent save operations
  const savingRef = useRef(false);

  /** Execute the save after drift has been resolved (or no drift detected) */
  const executeSave = useCallback(async () => {
    const engine = engineRef.current;
    const pendingMap = pendingMapRef.current;
    const registry = registryRef.current;
    if (!modPathRef.current || !engine || !engine.isLoaded()) return;

    try {
      // 1. Flush pending provinces
      if (pendingMap.count > 0) {
        // Sync reconciled IDs to registry
        for (const entry of pendingMap.getAll()) {
          const existing = registry.getProvinceByColor(entry.color);
          if (existing) {
            existing.id = entry.id;
            existing.isNew = true;
          }
        }

        setStatus(`Flushing ${pendingMap.count} pending provinces...`);
        await window.mapPainter.flushPendingProvinces({
          provinces: pendingMap.getAll(),
          options: pendingSaveOptions,
        });

        pendingMap.clear();
        setPendingCount(0);
      }

      // 2. Save map image
      setStatus('Saving provinces.png...');
      const rgbaBuffer = new Uint8Array(engine.stitchFullImage().buffer);
      const { width, height } = engine.getMapSize();
      await window.mapPainter.saveImage(modPathRef.current, rgbaBuffer, width, height);

      // 3. Save mod files
      setStatus('Saving mod files...');
      const provinces = registry.getAllProvinces();
      await window.mapPainter.saveMod({
        provinces,
        modifiedProvinceIds: Array.from(modifiedProvinceIds),
      });
      setModDirty(false);
      setModifiedProvinceIds(new Set());
      setDraftDirty(false);

      setStatus('Saved provinces.png + mod files');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Save error: ${msg}`);
    } finally {
      savingRef.current = false;
    }
  }, [engineRef, registryRef, pendingMapRef, modPathRef, modifiedProvinceIds, pendingSaveOptions, setStatus, setDraftDirty, setModDirty, setModifiedProvinceIds, setPendingCount]);

  /**
   * Perform the save — detects ID drift from disk before flushing pending.
   * If drift is found, shows the IdDriftDialog and waits for user confirmation.
   */
  const performSave = useCallback(async () => {
    const pendingMap = pendingMapRef.current;
    const registry = registryRef.current;
    if (!modPathRef.current) return;

    if (pendingMap.count > 0) {
      setStatus('Checking definition.csv for ID drift...');

      // Derive in-memory max committed ID
      const memMaxCommitted = PendingProvinceMap.deriveMaxCommittedId(registry, pendingMap);

      // Read disk state via IPC
      const diskResult = await window.mapPainter.loadDefinitions(modPathRef.current);
      let diskMaxId = 0;
      if (!diskResult.error && diskResult.provinces) {
        for (const p of diskResult.provinces) {
          if (p.id > diskMaxId) diskMaxId = p.id;
        }
      }

      // Use the higher of disk vs in-memory to ensure sequentiality
      const baseId = Math.max(memMaxCommitted, diskMaxId);

      // Reconcile pending IDs from this base
      const remaps = pendingMap.reconcileIds(baseId + 1);

      // Check if disk diverged from memory (drift)
      if (diskMaxId !== memMaxCommitted && remaps.length > 0) {
        setDriftRemaps(remaps);
        setPendingDriftSave(() => executeSave);
        setShowDriftDialog(true);
        setStatus('ID drift detected — awaiting confirmation');
        return;
      }
    }

    // No drift or no pending — proceed immediately
    await executeSave();
  }, [pendingMapRef, registryRef, modPathRef, executeSave, setStatus]);

  /** Save everything: scan for orphans first, show reconciliation dialog if needed */
  const handleSaveAll = useCallback(async () => {
    if (savingRef.current) {
      setStatus('Save already in progress...');
      return;
    }

    const engine = engineRef.current;
    if (!modPathRef.current || !engine || !engine.isLoaded()) {
      setStatus('Nothing to save — load a map first');
      return;
    }

    savingRef.current = true;

    try {
      setStatus('Scanning map for orphaned provinces...');
      const usedColors = await engine.collectUsedColorsAsync(new Set());

      const allProvinces = registryRef.current.getAllProvinces();
      const { orphanedProvinces, orphanedParents } = detectOrphans(
        allProvinces, usedColors, landedTitles
      );

      if (orphanedProvinces.length > 0) {
        setReconcileOrphans(orphanedProvinces);
        setReconcileParents(orphanedParents);
        setShowReconcileDialog(true);
      } else {
        await performSave();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Save error: ${msg}`);
      savingRef.current = false;
    }
  }, [engineRef, registryRef, modPathRef, landedTitles, performSave, setStatus]);

  /** Reconciliation: user confirmed removal */
  const handleReconcileConfirm = useCallback(async (
    confirmedRemovedIds: number[],
    confirmedRemovedTitleKeys: string[],
  ) => {
    setShowReconcileDialog(false);

    if (confirmedRemovedIds.length === 0) {
      await performSave();
      return;
    }

    try {
      setStatus('Reconciling provinces...');
      const allProvinces = registryRef.current.getAllProvinces();
      const removedSet = new Set(confirmedRemovedIds);

      const idMapEntries = buildIdRemap(allProvinces, removedSet);
      const idMap: Record<number, number> = {};
      for (const [oldId, newId] of idMapEntries) {
        idMap[oldId] = newId;
      }

      const surviving = allProvinces
        .filter(p => !removedSet.has(p.id))
        .map(p => ({ ...p, id: idMap[p.id] ?? p.id }))
        .sort((a, b) => a.id - b.id);

      await window.mapPainter.reconcileProvinces({
        removedIds: confirmedRemovedIds,
        idMap,
        removedTitleKeys: confirmedRemovedTitleKeys,
        provinces: surviving,
      });

      for (const id of confirmedRemovedIds) {
        registryRef.current.removeProvince(id);
      }
      registryRef.current.applyIdRemap(idMapEntries);
      setProvinceCount(registryRef.current.count);

      setStatus(`Reconciled: removed ${confirmedRemovedIds.length} provinces, renumbered IDs`);

      await performSave();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Reconciliation error: ${msg}`);
      savingRef.current = false;
    }
  }, [registryRef, performSave, setStatus, setProvinceCount]);

  const handleReconcileCancel = useCallback(() => {
    setShowReconcileDialog(false);
    savingRef.current = false;
    setStatus('Save cancelled — orphaned provinces detected');
  }, [setStatus]);

  /** User confirmed ID drift remaps — proceed with save */
  const handleDriftConfirm = useCallback(async () => {
    setShowDriftDialog(false);
    setDriftRemaps([]);
    const saveFn = pendingDriftSave;
    setPendingDriftSave(null);
    if (saveFn) await saveFn();
  }, [pendingDriftSave]);

  /** User cancelled the drift dialog — abort save */
  const handleDriftCancel = useCallback(() => {
    setShowDriftDialog(false);
    setDriftRemaps([]);
    setPendingDriftSave(null);
    savingRef.current = false;
    setStatus('Save cancelled — ID drift not confirmed');
  }, [setStatus]);

  return {
    showReconcileDialog, reconcileOrphans, reconcileParents,
    showDriftDialog, driftRemaps,
    performSave, handleSaveAll, handleReconcileConfirm, handleReconcileCancel,
    handleDriftConfirm, handleDriftCancel,
  };
}
