/** Voronoi generator: province subdivision workflow */

import { useState, useCallback } from 'react';
import type { RGB, ProvinceData, CreateProvinceRequest, PendingProvince, UndoAction } from '@shared/types';
import { rgbToKey } from '@shared/types';
import { TILE_SIZE } from '@shared/constants';
import { PendingProvinceMap } from '@registry/pending-province-map';
import type { VoronoiConfirmData } from '@tools/voronoi-types';
import type { EngineRef, RegistryRef, UndoManagerRef, PendingMapRef } from './types';

export interface UseVoronoiGeneratorParams {
  engineRef: EngineRef;
  registryRef: RegistryRef;
  undoManagerRef: UndoManagerRef;
  pendingMapRef: PendingMapRef;
  setStatus: (msg: string) => void;
  setDraftDirty: (dirty: boolean) => void;
  setPendingCount: (count: number) => void;
  setProvinceCount: (count: number) => void;
  cancelOtherPickingModes: () => void;
  triggerForceUpdate: () => void;
}

export function useVoronoiGenerator({
  engineRef, registryRef, undoManagerRef, pendingMapRef,
  setStatus, setDraftDirty, setPendingCount, setProvinceCount,
  cancelOtherPickingModes, triggerForceUpdate,
}: UseVoronoiGeneratorParams) {
  const [pickingGenerator, setPickingGenerator] = useState(false);
  const [generatorPickedProvince, setGeneratorPickedProvince] = useState<{
    color: RGB; data: ProvinceData | null;
  } | null>(null);

  const handleGeneratorStartPicking = useCallback(() => {
    cancelOtherPickingModes();
    setPickingGenerator(true);
  }, [cancelOtherPickingModes]);

  const handleGeneratorCancelPicking = useCallback(() => {
    setPickingGenerator(false);
    setGeneratorPickedProvince(null);
    const engine = engineRef.current;
    if (engine) {
      engine.clearOverlay();
      engine.setOverlayVisible(false);
    }
  }, [engineRef]);

  const handleGeneratorPick = useCallback((color: RGB) => {
    if (color.r === 0 && color.g === 0 && color.b === 0) {
      setStatus('Cannot subdivide empty/ocean pixels');
      return;
    }

    const province = registryRef.current.getProvinceByColor(color) ?? null;
    setGeneratorPickedProvince({ color, data: province });
    setPickingGenerator(false);
  }, [registryRef, setStatus]);

  const handleGeneratorConfirm = useCallback((data: VoronoiConfirmData) => {
    const engine = engineRef.current;
    const registry = registryRef.current;
    const pendingMap = pendingMapRef.current;
    if (!engine) return;

    try {
      const { result, region, originalColor, originalProvince } = data;
      const parentName = originalProvince?.name ?? `Province`;
      const { width: mapWidth } = engine.getMapSize();
      const tilesX = Math.ceil(mapWidth / TILE_SIZE);

      // 1. Determine affected tiles from region bounds
      const { minX, minY, maxX, maxY } = region.bounds;
      const minTx = Math.floor(minX / TILE_SIZE);
      const maxTx = Math.floor(maxX / TILE_SIZE);
      const minTy = Math.floor(minY / TILE_SIZE);
      const maxTy = Math.floor(maxY / TILE_SIZE);

      const affectedTileIndices: number[] = [];
      const beforeSnapshots = new Map<number, Uint8ClampedArray>();

      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          const tileIndex = ty * tilesX + tx;
          affectedTileIndices.push(tileIndex);
          beforeSnapshots.set(tileIndex, engine.snapshotTile(tileIndex));
        }
      }

      // 2. Generate unique colors for each sub-province
      const subColors: RGB[] = [];
      for (let i = 0; i < result.actualRegionCount; i++) {
        subColors.push(registry.suggestNextColor());
      }

      // 3. Apply pixel changes
      for (const [key, regionId] of result.assignment) {
        const [xStr, yStr] = key.split(',');
        const x = parseInt(xStr, 10);
        const y = parseInt(yStr, 10);
        const c = subColors[regionId];
        engine.setPixel(x, y, c);
      }

      // 4. Clear overlay
      engine.clearOverlay();
      engine.setOverlayVisible(false);

      // 5. Capture after snapshots
      const afterSnapshots = new Map<number, Uint8ClampedArray>();
      for (const tileIndex of affectedTileIndices) {
        afterSnapshots.set(tileIndex, engine.snapshotTile(tileIndex));
      }

      // 6. Register each sub-province and add to pending map
      const pendingEntries: PendingProvince[] = [];
      for (let i = 0; i < result.actualRegionCount; i++) {
        const c = subColors[i];
        const name = `${parentName}_${i + 1}`;
        const province = registry.registerProvince({
          color: c,
          name,
          titleTier: 'b',
        });

        const request: CreateProvinceRequest = {
          name,
          color: c,
          titleTier: 'b',
        };
        const entry: PendingProvince = {
          id: province.id,
          color: c,
          name,
          request,
        };
        pendingMap.add(entry);
        pendingEntries.push(entry);
      }

      // 7. If the original province was registered, remove it
      if (originalProvince) {
        registry.removeProvince(originalProvince.id);
        const origKey = rgbToKey(originalColor);
        if (pendingMap.has(origKey)) {
          pendingMap.remove(origKey);
        }
      }

      // 7b. Reconcile pending IDs to stay sequential after removal
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

      // 7c. Rescan affected tiles in sector manager
      const sm = registry.getSectorManager();
      if (sm.isPopulated) {
        sm.rescanByTiles(affectedTileIndices);
      }

      // 8. Push undo action
      const action: UndoAction = {
        tileIndices: affectedTileIndices,
        beforeSnapshots,
        afterSnapshots,
        description: `Generate ${result.actualRegionCount} sub-provinces from '${parentName}'`,
        pendingAdded: pendingEntries,
      };
      undoManagerRef.current.push(action);

      // 9. Update UI state
      setPendingCount(pendingMap.count);
      setProvinceCount(registry.count);
      setDraftDirty(true);
      setGeneratorPickedProvince(null);
      triggerForceUpdate();
      setStatus(`Generated ${result.actualRegionCount} sub-provinces from '${parentName}'`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Generator error: ${msg}`);
    }
  }, [engineRef, registryRef, pendingMapRef, undoManagerRef, setStatus, setDraftDirty, setPendingCount, setProvinceCount, triggerForceUpdate]);

  const handleOverlayChange = useCallback((visible: boolean) => {
    const engine = engineRef.current;
    if (engine) {
      engine.setOverlayVisible(visible);
    }
  }, [engineRef]);

  return {
    pickingGenerator, generatorPickedProvince,
    handleGeneratorStartPicking, handleGeneratorCancelPicking,
    handleGeneratorPick, handleGeneratorConfirm, handleOverlayChange,
    setPickingGenerator, setGeneratorPickedProvince,
  };
}
