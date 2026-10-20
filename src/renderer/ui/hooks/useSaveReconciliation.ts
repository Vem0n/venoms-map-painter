/** Save + reconciliation: flush pending, save image + mod files, orphan reconciliation dialog */

import { reportSaveFailure } from '../save-failure';
import type { SaveFailureReport } from '@shared/types';
import { useState, useCallback, useRef } from 'react';
import { rgbToKey } from '@shared/types';
import type { ProvinceData, LandedTitleNode, PendingSaveOptions } from '@shared/types';
import { definitionDifferences, diskTitleKey, renameTitleTree, removableTitleKeys } from '@shared/save-safety';
import type { TitleRename } from '@shared/save-safety';
import { detectOrphans, buildIdRemap } from '../../reconciliation/reconcile';
import { PendingProvinceMap } from '@registry/pending-province-map';
import type { EngineRef, RegistryRef, PendingMapRef, ModPathRef } from './types';

export interface UseSaveReconciliationParams {
  sourceDefinitionsRef: React.MutableRefObject<ProvinceData[] | null>;
  draftLoadedName: string | null;
  titleRenames: TitleRename[];
  setTitleRenames: React.Dispatch<React.SetStateAction<TitleRename[]>>;
  setLandedTitles: (titles: LandedTitleNode[]) => void;
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
  sourceDefinitionsRef, draftLoadedName, titleRenames, setTitleRenames, setLandedTitles,
  engineRef, registryRef, pendingMapRef, modPathRef,
  modifiedProvinceIds, landedTitles, pendingSaveOptions,
  setStatus, setDraftDirty, setModDirty, setModifiedProvinceIds,
  setPendingCount, setProvinceCount,
}: UseSaveReconciliationParams) {
  const savePathRef = useRef<string | null>(null);
  const pendingBaseRef = useRef<number | undefined>(undefined);
  const [saveFailure, setSaveFailure] = useState<SaveFailureReport | null>(null);
  const clearSaveFailure = useCallback(() => setSaveFailure(null), []);
  const showSaveFailure = useCallback(async (error: unknown, operation: string) => {
    setStatus(`Saving has failed: ${error instanceof Error ? error.message : String(error)}`);
    setSaveFailure(await reportSaveFailure(error, { operation, target: savePathRef.current ?? modPathRef.current ?? undefined }));
  }, [modPathRef, setStatus]);
  const [modSaveReview, setModSaveReview] = useState<{ modPath: string; differences: string[]; missingSnapshot: boolean } | null>(null);
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [reconcileOrphans, setReconcileOrphans] = useState<ProvinceData[]>([]);

  // ID drift detection state
  const [showDriftDialog, setShowDriftDialog] = useState(false);
  const [driftRemaps, setDriftRemaps] = useState<Array<{ oldId: number; newId: number }>>([]);
  const [pendingDriftSave, setPendingDriftSave] = useState<(() => Promise<void>) | null>(null);

  // Save mutex — prevents concurrent save operations
  const savingRef = useRef(false);

  /** Execute the save after drift has been resolved (or no drift detected) */
  const executeSave = useCallback(async (renamesToApply: TitleRename[] = titleRenames, modifiedIdsToSave: Set<number> = modifiedProvinceIds, pendingBaseId?: number) => {
    const engine = engineRef.current;
    const pendingMap = pendingMapRef.current;
    const registry = registryRef.current;
    const modPath = savePathRef.current;
    if (!modPath || !engine || !engine.isLoaded()) return;

    try {
      for (const rename of renamesToApply) {
        if (!await window.mapPainter.renameTitle(modPath, rename.oldKey, rename.newKey)) {
          throw new Error(`Title not found while applying rename: ${rename.oldKey}`);
        }
        setTitleRenames(prev => prev.filter(item => item.oldKey !== rename.oldKey || item.newKey !== rename.newKey));
      }

      // 1. Flush pending provinces
      if (pendingMap.count > 0) {
        if (pendingBaseId !== undefined) pendingMap.reconcileIds(pendingBaseId);
        // Sync reconciled IDs to registry
        for (const entry of pendingMap.getAll()) {
          const existing = registry.getProvinceByColor(entry.color);
          if (existing) {
            existing.id = entry.id;
            existing.isNew = true;
          }
        }

        setStatus(`Flushing ${pendingMap.count} pending provinces...`);
        await window.mapPainter.flushPendingProvinces(modPath, {
          provinces: pendingMap.getAll().map(entry => ({
            ...entry,
            request: {
              ...entry.request,
              parentTitle: renamesToApply.reduce((key, rename) => key === rename.oldKey ? rename.newKey : key, entry.request.parentTitle),
              parentDuchy: renamesToApply.reduce((key, rename) => key === rename.oldKey ? rename.newKey : key, entry.request.parentDuchy),
            },
          })),
          options: pendingSaveOptions,
        });

        pendingMap.clear();
        setPendingCount(0);
      }

      // 2. Save map image
      setStatus('Saving provinces.png...');
      const rgbaBuffer = new Uint8Array(engine.stitchFullImage().buffer);
      const { width, height } = engine.getMapSize();
      await window.mapPainter.saveImage(modPath, rgbaBuffer, width, height);

      // 3. Save mod files
      setStatus('Saving mod files...');
      const provinces = registry.getAllProvinces();
      await window.mapPainter.saveMod(modPath, {
        provinces,
        modifiedProvinceIds: Array.from(modifiedIdsToSave),
      });
      const savedMod = await window.mapPainter.loadMod(modPath);
      if (!savedMod.success || !savedMod.data) throw new Error(savedMod.error ?? 'Could not reload saved titles');
      setLandedTitles(savedMod.data.landedTitles);
      sourceDefinitionsRef.current = structuredClone(registry.getAllProvinces().map(({ id, color, name }) => ({ id, color, name })));
      setModDirty(false);
      setModifiedProvinceIds(new Set());
      setDraftDirty(false);

      setStatus('Saved provinces.png + mod files');
    } catch (err) {
      await showSaveFailure(err, 'save-to-mod');
    } finally {
      savingRef.current = false;
      savePathRef.current = null;
      pendingBaseRef.current = undefined;
    }
  }, [engineRef, registryRef, pendingMapRef, modPathRef, modifiedProvinceIds, pendingSaveOptions, setStatus, setDraftDirty, setModDirty, setModifiedProvinceIds, setPendingCount, sourceDefinitionsRef, titleRenames, setTitleRenames, setLandedTitles, showSaveFailure]);

  /** Final review before any writes: scan only, then wait for orphan choices. */
  const scanForOrphans = useCallback(async (pendingBaseId?: number) => {
    try {
      const engine = engineRef.current;
      if (!engine || !savePathRef.current) throw new Error('No save target');
      pendingBaseRef.current = pendingBaseId;
      setStatus('Scanning map for orphaned provinces...');
      const usedColors = await engine.collectUsedColorsAsync(new Set());
      const { orphanedProvinces } = detectOrphans(
        registryRef.current.getAllProvinces(), usedColors, landedTitles
      );
      if (orphanedProvinces.length > 0) {
        setReconcileOrphans(orphanedProvinces);
        setShowReconcileDialog(true);
      } else {
        await executeSave(titleRenames, modifiedProvinceIds, pendingBaseId);
      }
    } catch (err) {
      await showSaveFailure(err, 'save-to-mod-preflight');
      savingRef.current = false;
      savePathRef.current = null;
      pendingBaseRef.current = undefined;
    }
  }, [engineRef, registryRef, landedTitles, executeSave, titleRenames, modifiedProvinceIds, setStatus, showSaveFailure]);

  /** All ID checks precede the orphan dialog and all file mutations. */
  const beginSaveScan = useCallback(async () => {
    try {
      const modPath = savePathRef.current;
      if (!modPath) throw new Error('No save target');
      const pendingMap = pendingMapRef.current;
      let pendingBaseId: number | undefined;
      if (pendingMap.count > 0) {
        setStatus('Checking definition.csv for ID drift...');
        const disk = await window.mapPainter.loadDefinitions(modPath);
        if (disk.error) throw new Error(disk.error);
        const memMax = PendingProvinceMap.deriveMaxCommittedId(registryRef.current, pendingMap);
        const diskMax = disk.provinces.reduce((max, province) => Math.max(max, province.id), 0);
        const base = Math.max(memMax, diskMax) + 1;
        pendingBaseId = base;
        const remaps = pendingMap.getAll().map((entry, index) => ({ oldId: entry.id, newId: base + index }))
          .filter(remap => remap.oldId !== remap.newId);
        if (diskMax !== memMax && remaps.length > 0) {
          setDriftRemaps(remaps);
          setPendingDriftSave(() => () => scanForOrphans(base));
          setShowDriftDialog(true);
          setStatus('ID drift detected — awaiting confirmation');
          return;
        }
      }
      await scanForOrphans(pendingBaseId);
    } catch (err) {
      await showSaveFailure(err, 'save-to-mod-preflight');
      savingRef.current = false;
      savePathRef.current = null;
      pendingBaseRef.current = undefined;
    }
  }, [pendingMapRef, registryRef, scanForOrphans, setStatus, showSaveFailure]);

  /** Explicit Save to Mod; draft saves never reach this path. */
  const handleSaveAll = useCallback(async () => {
    if (savingRef.current) {
      setStatus('Save already in progress...');
      return;
    }
    const modPath = modPathRef.current;
    if (!modPath || !engineRef.current?.isLoaded()) {
      setStatus('Nothing to save — load a map first');
      return;
    }
    savingRef.current = true;
    savePathRef.current = modPath;
    try {
      const disk = await window.mapPainter.loadDefinitions(modPath);
      if (disk.error) throw new Error(disk.error);
      const baseline = sourceDefinitionsRef.current;
      const differences = baseline ? definitionDifferences(baseline, disk.provinces) : [];
      if (draftLoadedName !== null || differences.length > 0) {
        setModSaveReview({ modPath, differences, missingSnapshot: baseline === null });
        return;
      }
      await beginSaveScan();
    } catch (err) {
      await showSaveFailure(err, 'save-to-mod-preflight');
      savingRef.current = false;
    }
  }, [engineRef, modPathRef, sourceDefinitionsRef, draftLoadedName, beginSaveScan, setStatus, showSaveFailure]);

  const handleModSaveConfirm = useCallback(async () => {
    setModSaveReview(null);
    await beginSaveScan();
  }, [beginSaveScan]);

  const handleModSaveCancel = useCallback(() => {
    setModSaveReview(null);
    savingRef.current = false;
    savePathRef.current = null;
    pendingBaseRef.current = undefined;
    setStatus('Save to mod cancelled — mod files unchanged');
  }, [setStatus]);

  /** Reconciliation: user confirmed removal */
  const handleReconcileConfirm = useCallback(async (
    confirmedRemovedIds: number[],
    confirmedRemovedTitleKeys: string[],
  ) => {
    const modPath = savePathRef.current;
    if (!modPath) return;
    setShowReconcileDialog(false);

    if (confirmedRemovedIds.length === 0) {
      await executeSave(titleRenames, modifiedProvinceIds, pendingBaseRef.current);
      return;
    }

    try {
      setStatus('Reconciling provinces...');
      const allProvinces = registryRef.current.getAllProvinces();
      const removedSet = new Set(confirmedRemovedIds);
      const removable = removableTitleKeys(landedTitles, removedSet);
      const removedTitleKeys = confirmedRemovedTitleKeys.filter(key => removable.has(key));

      const idMapEntries = buildIdRemap(allProvinces, removedSet);
      const idMap: Record<number, number> = {};
      for (const [oldId, newId] of idMapEntries) {
        idMap[oldId] = newId;
      }

      const surviving = allProvinces
        .filter(p => !removedSet.has(p.id))
        .map(p => ({ ...p, id: idMap[p.id] ?? p.id }))
        .sort((a, b) => a.id - b.id);

      await window.mapPainter.reconcileProvinces(modPath, {
        removedIds: confirmedRemovedIds,
        idMap,
        removedTitleKeys: removedTitleKeys.map(key => diskTitleKey(key, titleRenames)),
        provinces: surviving,
      });

      for (const id of confirmedRemovedIds) {
        registryRef.current.removeProvince(id);
      }
      registryRef.current.applyIdRemap(idMapEntries);
      for (const entry of pendingMapRef.current.getAll()) {
        if (removedSet.has(entry.id)) pendingMapRef.current.remove(rgbToKey(entry.color));
        else entry.id = idMapEntries.get(entry.id) ?? entry.id;
      }
      setPendingCount(pendingMapRef.current.count);
      const remappedModifiedIds = new Set([...modifiedProvinceIds]
        .filter(id => !removedSet.has(id)).map(id => idMapEntries.get(id) ?? id));
      setModifiedProvinceIds(remappedModifiedIds);
      setProvinceCount(registryRef.current.count);
      const reloaded = await window.mapPainter.loadMod(modPath);
      if (!reloaded.success || !reloaded.data) throw new Error(reloaded.error ?? 'Could not reload reconciled titles');
      setLandedTitles(renameTitleTree(reloaded.data.landedTitles, titleRenames));
      // Renames inside a deleted parent no longer need to be applied.
      const survivingTitleKeys = new Set<string>();
      const collect = (nodes: LandedTitleNode[]) => nodes.forEach(node => { survivingTitleKeys.add(node.key); collect(node.children); });
      collect(reloaded.data.landedTitles);
      const survivingRenames = titleRenames.filter(rename => survivingTitleKeys.has(diskTitleKey(rename.oldKey, titleRenames)));
      setTitleRenames(survivingRenames);

      setStatus(`Reconciled: removed ${confirmedRemovedIds.length} provinces, renumbered IDs`);

      // Removal explicitly authorizes sequential renumbering. Its final pending
      // allocation follows the surviving committed IDs; no further dialogs or
      // disk-ID checks are allowed after reconciliation has started writing.
      const pendingBaseId = PendingProvinceMap.deriveMaxCommittedId(registryRef.current, pendingMapRef.current) + 1;
      await executeSave(survivingRenames, remappedModifiedIds, pendingBaseId);
    } catch (err) {
      await showSaveFailure(err, 'reconcile-and-save');
      savingRef.current = false;
    }
  }, [registryRef, modPathRef, executeSave, setStatus, setProvinceCount, landedTitles, titleRenames, setTitleRenames, setLandedTitles, pendingMapRef, modifiedProvinceIds, setModifiedProvinceIds, setPendingCount, showSaveFailure]);

  const handleReconcileCancel = useCallback(() => {
    setShowReconcileDialog(false);
    savingRef.current = false;
    savePathRef.current = null;
    pendingBaseRef.current = undefined;
    setStatus('Save cancelled — orphaned provinces detected');
  }, [setStatus]);

  /** ID approval continues to orphan review; it never writes files. */
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
    savePathRef.current = null;
    pendingBaseRef.current = undefined;
    setStatus('Save cancelled — ID drift not confirmed');
  }, [setStatus]);

  return {
    saveFailure, clearSaveFailure,
    modSaveReview, handleModSaveConfirm, handleModSaveCancel,
    showReconcileDialog, reconcileOrphans,
    showDriftDialog, driftRemaps,
    handleSaveAll, handleReconcileConfirm, handleReconcileCancel,
    handleDriftConfirm, handleDriftCancel,
  };
}
