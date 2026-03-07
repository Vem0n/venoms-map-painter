/**
 * Selection Overlay — Writes visual selection highlights to the TileEngine overlay.
 *
 * Delegates to TileEngine.scanTilesForOverlay() which uses direct tile buffer
 * access for ~10-20x faster rendering compared to per-pixel getPixel() calls.
 * Highlights all pixels of selected province colors across the entire map,
 * including parts that extend beyond the lasso polygon.
 */

import type { TileEngine } from '@engine/tile-engine';
import type { LassoPoint } from './lasso-select';

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
 * Write overlay highlight for all pixels within a lasso polygon (normal select).
 * Uses scanline intersection per row. All pixels inside the polygon get
 * the fill color regardless of province membership.
 */
export function writePolygonOverlay(
  engine: TileEngine,
  polygon: LassoPoint[],
  emptyColors: Set<string>,
): Promise<void> {
  const { width: mapWidth, height: mapHeight } = engine.getMapSize();
  const [fillR, fillG, fillB, fillA] = FILL_RGBA;

  let minY = Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(mapHeight - 1, Math.ceil(maxY));

  let minX = Infinity, maxX = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  minX = Math.max(0, Math.floor(minX));
  maxX = Math.min(mapWidth - 1, Math.ceil(maxX));

  engine.clearOverlay();

  const yieldInterval = 128;
  let y = minY;

  // Inline scanline intersections for speed
  const n = polygon.length;

  return new Promise((resolve) => {
    const processRows = (): void => {
      const endY = Math.min(y + yieldInterval, maxY + 1);

      for (; y < endY; y++) {
        // Compute scanline intersections
        const xs: number[] = [];
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const yi = polygon[i].y;
          const yj = polygon[j].y;
          if ((yi <= y && yj <= y) || (yi > y && yj > y)) continue;
          if (yi === yj) continue;
          const xi = polygon[i].x;
          const xj = polygon[j].x;
          xs.push(Math.round(xi + (y - yi) / (yj - yi) * (xj - xi)));
        }
        xs.sort((a, b) => a - b);

        for (let p = 0; p + 1 < xs.length; p += 2) {
          const x0 = Math.max(minX, xs[p]);
          const x1 = Math.min(maxX, xs[p + 1]);
          for (let x = x0; x <= x1; x++) {
            engine.setOverlayPixel(x, y, fillR, fillG, fillB, fillA);
          }
        }
      }

      if (y <= maxY) {
        setTimeout(processRows, 0);
      } else {
        engine.setOverlayVisible(true);
        resolve();
      }
    };

    processRows();
  });
}

/**
 * Clear the selection overlay.
 */
export function clearSelectionOverlay(engine: TileEngine): void {
  engine.clearOverlay();
  engine.setOverlayVisible(false);
}
