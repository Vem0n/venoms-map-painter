/**
 * Lasso Select — Core algorithm for freeform polygon selection.
 *
 * Uses scanline intersection for fast polygon rasterization instead of
 * per-pixel point-in-polygon testing. Collects unique province colors
 * that fall inside the lasso polygon.
 */

import type { TileEngine } from '@engine/tile-engine';
import { rgbToKey } from '@shared/types';

export interface LassoPoint {
  x: number;
  y: number;
}

export interface BoundsRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LassoResult {
  /** Set of rgbToKey strings for all province colors touched by the lasso */
  colors: Set<string>;
  /** Bounding rectangle of the lasso polygon (clamped to map) */
  bounds: BoundsRect;
}

/**
 * Raycasting point-in-polygon test.
 * Returns true if (px, py) is inside the polygon defined by `points`.
 */
export function pointInPolygon(px: number, py: number, points: LassoPoint[]): boolean {
  const n = points.length;
  if (n < 3) return false;

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;

    if (
      ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Compute sorted X-intersections of a polygon with a horizontal scanline at `y`.
 * Returns sorted array of integer X values where the scanline crosses polygon edges.
 */
function scanlineIntersections(y: number, polygon: LassoPoint[]): number[] {
  const xs: number[] = [];
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = polygon[i].y;
    const yj = polygon[j].y;

    // Skip horizontal edges and edges that don't cross this scanline
    if ((yi <= y && yj <= y) || (yi > y && yj > y)) continue;
    // Skip exact top vertices to avoid double-counting at vertices
    if (yi === yj) continue;

    const xi = polygon[i].x;
    const xj = polygon[j].x;
    const x = xi + (y - yi) / (yj - yi) * (xj - xi);
    xs.push(Math.round(x));
  }

  xs.sort((a, b) => a - b);
  return xs;
}

/**
 * Collect all unique province colors whose pixels fall inside the lasso polygon.
 * Uses scanline intersection for O(height × edges) performance instead of
 * O(width × height × edges) from per-pixel point-in-polygon testing.
 *
 * Yields to the event loop every `yieldInterval` rows to avoid UI freeze.
 */
export function collectLassoColors(
  engine: TileEngine,
  polygon: LassoPoint[],
  emptyColors: Set<string>,
): Promise<LassoResult> {
  const { width: mapWidth, height: mapHeight } = engine.getMapSize();

  // Compute bounding box, clamped to map
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  minX = Math.max(0, Math.floor(minX));
  minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(mapWidth - 1, Math.ceil(maxX));
  maxY = Math.min(mapHeight - 1, Math.ceil(maxY));

  const bounds: BoundsRect = { minX, minY, maxX, maxY };
  const colors = new Set<string>();
  const yieldInterval = 128;

  let y = minY;

  return new Promise((resolve) => {
    const processRows = (): void => {
      const endY = Math.min(y + yieldInterval, maxY + 1);

      for (; y < endY; y++) {
        const xs = scanlineIntersections(y, polygon);
        // Fill between pairs of intersections
        for (let p = 0; p + 1 < xs.length; p += 2) {
          const x0 = Math.max(minX, xs[p]);
          const x1 = Math.min(maxX, xs[p + 1]);

          for (let x = x0; x <= x1; x++) {
            const px = engine.getPixel(x, y);
            const key = rgbToKey(px);
            if (!emptyColors.has(key)) {
              colors.add(key);
            }
          }
        }
      }

      if (y <= maxY) {
        setTimeout(processRows, 0);
      } else {
        resolve({ colors, bounds });
      }
    };

    processRows();
  });
}

/**
 * Get the province color at a single global coordinate, or null if empty/OOB.
 */
export function getColorAtPoint(
  engine: TileEngine,
  gx: number,
  gy: number,
  emptyColors: Set<string>,
): string | null {
  const { width, height } = engine.getMapSize();
  if (gx < 0 || gx >= width || gy < 0 || gy >= height) return null;

  const px = engine.getPixel(gx, gy);
  const key = rgbToKey(px);
  if (emptyColors.has(key)) return null;
  return key;
}
