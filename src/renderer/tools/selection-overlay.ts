/**
 * Selection Overlay — Writes visual selection highlights to the TileEngine overlay.
 *
 * Delegates to TileEngine.scanTilesForOverlay() which uses direct tile buffer
 * access for ~10-20x faster rendering compared to per-pixel getPixel() calls.
 * Highlights all pixels of selected province colors across the entire map,
 * including parts that extend beyond the lasso polygon.
 */

import type { TileEngine } from '@engine/tile-engine';

/** Selection tint color (light blue, more visible) */
const FILL_RGBA: [number, number, number, number] = [88, 166, 255, 120];

/** Selection border color (strong blue, near-opaque) */
const BORDER_RGBA: [number, number, number, number] = [88, 166, 255, 230];

/**
 * Write selection highlight to the engine overlay.
 * Uses direct tile buffer iteration with packed integer color comparison
 * for efficient scanning. Border pixels (4-neighbor check) get a stronger tint.
 *
 * @param tileSubset - Optional set of tile indices to scan. When provided,
 *   only these tiles are processed instead of the full map.
 */
export function writeSelectionOverlay(
  engine: TileEngine,
  selectedColors: Set<string>,
  tileSubset?: ReadonlySet<number>,
): Promise<void> {
  return engine.scanTilesForOverlay(selectedColors, FILL_RGBA, BORDER_RGBA, tileSubset);
}

/**
 * Clear the selection overlay.
 */
export function clearSelectionOverlay(engine: TileEngine): void {
  engine.clearOverlay();
  engine.setOverlayVisible(false);
}
