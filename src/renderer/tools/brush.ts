/**
 * Brush — Circular brush tool for manual pixel painting.
 *
 * Paints pixels within a configurable radius around the cursor.
 * Used for fine detail work and manual corrections.
 */

import { RGB } from '@shared/types';
import { TILE_SIZE } from '@shared/constants';
import type { TileEngine } from '@engine/tile-engine';

export interface BrushResult {
  pixelCount: number;
  affectedTiles: Set<number>;
}

export interface BrushOptions {
  /** When true, only paint pixels that are considered "empty". Existing province pixels are skipped. */
  respectBorders?: boolean;
  /** Custom check for whether a pixel color is considered empty. Defaults to (0,0,0) check. */
  isEmptyColor?: (color: RGB) => boolean;
  /** When set, only paint over pixels matching this specific color (province lock). */
  isTargetColor?: (color: RGB) => boolean;
}

/**
 * Paint a circular brush stroke at the given global coordinates.
 *
 * @param respectBorders - When true, only overwrite empty/unassigned pixels (0,0,0).
 *   Pixels already belonging to a province are left untouched.
 */
export function brushPaint(
  engine: TileEngine,
  centerX: number,
  centerY: number,
  radius: number,
  color: RGB,
  options?: BrushOptions
): BrushResult {
  const { width: mapWidth, height: mapHeight } = engine.getMapSize();
  const tilesX = Math.ceil(mapWidth / TILE_SIZE);
  const affectedTiles = new Set<number>();
  let pixelCount = 0;
  const respectBorders = options?.respectBorders ?? false;
  const isEmptyColor = options?.isEmptyColor ?? ((c: RGB) => c.r === 0 && c.g === 0 && c.b === 0);
  const isTargetColor = options?.isTargetColor;

  const r2 = radius * radius;
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(mapWidth - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(mapHeight - 1, Math.ceil(centerY + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= r2) {
        // Check pixel filters (respectBorders and/or province lock)
        if (respectBorders || isTargetColor) {
          const existing = engine.getPixel(x, y);
          if (respectBorders && !isEmptyColor(existing)) {
            continue;
          }
          if (isTargetColor && !isTargetColor(existing)) {
            continue;
          }
        }

        engine.setPixel(x, y, color);
        pixelCount++;

        const tx = Math.floor(x / TILE_SIZE);
        const ty = Math.floor(y / TILE_SIZE);
        affectedTiles.add(ty * tilesX + tx);
      }
    }
  }

  return { pixelCount, affectedTiles };
}

/**
 * Paint a line between two points (for drag interpolation).
 * Uses Bresenham's line algorithm to connect points, painting a brush
 * stamp at each step along the line.
 */
export function brushLine(
  engine: TileEngine,
  x0: number, y0: number,
  x1: number, y1: number,
  radius: number,
  color: RGB,
  options?: BrushOptions
): BrushResult {
  const affectedTiles = new Set<number>();
  let pixelCount = 0;

  // Bresenham's line algorithm
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let cx = x0;
  let cy = y0;

  while (true) {
    const result = brushPaint(engine, cx, cy, radius, color, options);
    pixelCount += result.pixelCount;
    for (const tile of result.affectedTiles) {
      affectedTiles.add(tile);
    }

    if (cx === x1 && cy === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }

  return { pixelCount, affectedTiles };
}
