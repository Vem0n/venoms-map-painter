/** Lasso multi-select state + handlers */

import { useState, useCallback } from 'react';
import type { LassoPoint } from '@tools/lasso-select';
import { collectLassoColors, getColorAtPoint } from '@tools/lasso-select';
import { writeSelectionOverlay, clearSelectionOverlay } from '@tools/selection-overlay';
import { rgbToKey, keyToRgb } from '@shared/types';
import type { RGB, UndoAction } from '@shared/types';
import type { EngineRef, ToolManagerRef, RegistryRef, UndoManagerRef } from './types';

export interface UseLassoSelectionParams {
  engineRef: EngineRef;
  toolManagerRef: ToolManagerRef;
  registryRef: RegistryRef;
  undoManagerRef: UndoManagerRef;
  /** Ref to the current brush/paint color — used as palette base for harmonize. */
  activeColorRef: React.RefObject<RGB>;
  setStatus: (msg: string) => void;
  setDraftDirty: (dirty: boolean) => void;
  setModDirty: (dirty: boolean) => void;
  setModifiedProvinceIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  /** Called after harmonize remaps a province color (syncs pending map). */
  onColorRemap: (oldColor: RGB, newColor: RGB) => void;
}

/** Convert RGB to HSL hue (0-1). Returns 0 for achromatic colors. */
function rgbToHue(c: RGB): number {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h;
}

export function useLassoSelection({
  engineRef, toolManagerRef, registryRef, undoManagerRef, activeColorRef,
  setStatus, setDraftDirty, setModDirty, setModifiedProvinceIds,
  onColorRemap,
}: UseLassoSelectionParams) {
  const [selectedProvinces, setSelectedProvinces] = useState<Set<string>>(new Set());
  const [harmonizing, setHarmonizing] = useState(false);

  /** Compute tile subset from SectorManager for a set of color keys. */
  const getTileSubset = useCallback((colorKeys: Set<string>): Set<number> | undefined => {
    const sm = registryRef.current.getSectorManager();
    if (!sm.isPopulated) return undefined;
    return sm.getTilesForColors(colorKeys);
  }, [registryRef]);

  const clearSelection = useCallback(() => {
    const engine = engineRef.current;
    if (engine) clearSelectionOverlay(engine);
    setSelectedProvinces(new Set());
  }, [engineRef]);

  const handleLassoComplete = useCallback(async (polygon: LassoPoint[]) => {
    const engine = engineRef.current;
    const tm = toolManagerRef.current;
    if (!engine || !engine.isLoaded()) return;

    setStatus('Selecting provinces...');
    const emptySet = new Set(tm ? tm.getEmptyColors().map(c => rgbToKey(c)) : []);
    const result = await collectLassoColors(engine, polygon, emptySet);

    if (result.colors.size === 0) {
      setStatus('No provinces in selection');
      return;
    }

    setSelectedProvinces(result.colors);
    const tileSubset = getTileSubset(result.colors);
    await writeSelectionOverlay(engine, result.colors, tileSubset);
    setStatus(`Selected ${result.colors.size} province(s)`);
  }, [engineRef, toolManagerRef, setStatus, getTileSubset]);

  const handleLassoShiftClick = useCallback(async (gx: number, gy: number) => {
    const engine = engineRef.current;
    const tm = toolManagerRef.current;
    if (!engine || !engine.isLoaded()) return;

    const emptySet = new Set(tm ? tm.getEmptyColors().map(c => rgbToKey(c)) : []);
    const colorKey = getColorAtPoint(engine, gx, gy, emptySet);
    if (!colorKey) return;

    setSelectedProvinces(prev => {
      const next = new Set(prev);
      if (next.has(colorKey)) {
        next.delete(colorKey);
      } else {
        next.add(colorKey);
      }

      if (next.size === 0) {
        clearSelectionOverlay(engine);
        setStatus('Selection cleared');
      } else {
        const tileSubset = getTileSubset(next);
        writeSelectionOverlay(engine, next, tileSubset);
        setStatus(`Selected ${next.size} province(s)`);
      }

      return next;
    });
  }, [engineRef, toolManagerRef, setStatus, getTileSubset]);

  const handleHarmonize = useCallback(async () => {
    const engine = engineRef.current;
    const registry = registryRef.current;
    const undoManager = undoManagerRef.current;
    if (!engine || !engine.isLoaded() || !registry || selectedProvinces.size === 0) return;

    setHarmonizing(true);
    setStatus('Harmonizing colors...');

    try {
      // Resolve selected color keys to province data
      const provinces: { key: string; oldColor: RGB; id: number }[] = [];
      for (const key of selectedProvinces) {
        const color = keyToRgb(key);
        const province = registry.getProvinceByColor(color);
        if (province) {
          provinces.push({ key, oldColor: { ...color }, id: province.id });
        }
      }

      if (provinces.length === 0) {
        setStatus('No registered provinces in selection');
        setHarmonizing(false);
        return;
      }

      // Use the current brush color's hue as palette base
      const baseHue = rgbToHue(activeColorRef.current ?? provinces[0].oldColor);

      // Generate new palette
      const newColors = registry.generatePalette(baseHue, provinces.length);
      if (newColors.length < provinces.length) {
        setStatus(`Could only generate ${newColors.length}/${provinces.length} unique colors`);
        setHarmonizing(false);
        return;
      }

      // 1. Pre-discover all tiles that contain any selected color
      const tileSubset = getTileSubset(selectedProvinces);
      const affectedTileIndices = engine.findTilesWithColors(selectedProvinces, tileSubset);

      // 2. Snapshot all affected tiles BEFORE any modifications
      const beforeSnapshots = new Map<number, Uint8ClampedArray>();
      for (const tileIdx of affectedTileIndices) {
        beforeSnapshots.set(tileIdx, engine.snapshotTile(tileIdx));
      }

      // 3. Replace colors sequentially
      const colorRemaps: [RGB, RGB][] = [];
      let totalPixels = 0;

      for (let i = 0; i < provinces.length; i++) {
        const { oldColor } = provinces[i];
        const newColor = newColors[i];

        const result = await engine.replaceColorAsync(oldColor, newColor);
        totalPixels += result.pixelCount;

        // Update registry after pixels are replaced (also remaps SectorManager keys)
        registry.updateProvinceColor(oldColor, newColor);
        // Sync pending province map if this color was pending
        onColorRemap(oldColor, newColor);
        colorRemaps.push([oldColor, newColor]);
      }

      // 4. Snapshot all affected tiles AFTER all modifications
      const afterSnapshots = new Map<number, Uint8ClampedArray>();
      for (const tileIdx of affectedTileIndices) {
        afterSnapshots.set(tileIdx, engine.snapshotTile(tileIdx));
      }

      // 5. Push undo action
      const action: UndoAction = {
        tileIndices: Array.from(affectedTileIndices),
        beforeSnapshots,
        afterSnapshots,
        description: `Harmonize ${provinces.length} province colors`,
        colorRemaps,
      };
      undoManager.push(action);

      // 6. Mark provinces as modified for save
      setModifiedProvinceIds(prev => {
        const next = new Set(prev);
        for (const p of provinces) next.add(p.id);
        return next;
      });

      setDraftDirty(true);
      setModDirty(true);

      // 7. Clear selection overlay (colors changed, old overlay is stale)
      clearSelectionOverlay(engine);
      setSelectedProvinces(new Set());

      setStatus(`Harmonized ${provinces.length} province(s) — ${totalPixels.toLocaleString()} pixels`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Harmonize error: ${msg}`);
    } finally {
      setHarmonizing(false);
    }
  }, [engineRef, registryRef, undoManagerRef, selectedProvinces, setStatus, setDraftDirty, setModDirty, setModifiedProvinceIds, getTileSubset, onColorRemap]);

  return {
    selectedProvinces, harmonizing,
    clearSelection,
    handleLassoComplete,
    handleLassoShiftClick,
    handleHarmonize,
  };
}
