/**
 * FloodFill — Scanline flood fill algorithm operating in global coordinate space.
 *
 * CRITICAL: Uses iterative scanline approach, NOT recursive.
 * Recursive flood fill would stack overflow on large regions (100k+ pixels).
 *
 * Works through TileEngine's getPixel/setPixel abstraction so tile
 * boundaries are invisible to this algorithm.
 */

import { RGB } from '@shared/types';
import { TILE_SIZE } from '@shared/constants';
import type { TileEngine } from '@engine/tile-engine';

export interface FillResult {
  /** Number of pixels filled */
  pixelCount: number;
  /** Set of tile indices that were modified (for undo snapshots) */
  affectedTiles: Set<number>;
}

export interface FloodFillOptions {
  /** When true, only fill if the clicked pixel is considered "empty". Refuses to overwrite existing provinces. */
  respectBorders?: boolean;
  /** Custom check for whether a pixel color is considered empty. Defaults to (0,0,0) check. */
  isEmptyColor?: (color: RGB) => boolean;
  /** When set, only fill pixels matching this specific color (province lock). */
  isTargetColor?: (color: RGB) => boolean;
  /** Called the first time a tile is about to be modified. Use for lazy undo snapshots. */
  onNewTile?: (tileIndex: number) => void;
}

/**
 * Perform a scanline flood fill starting at (startX, startY).
 * Replaces all connected pixels matching the target color with the fill color.
 *
 * @param engine - TileEngine for pixel access
 * @param startX - Global X coordinate to start fill
 * @param startY - Global Y coordinate to start fill
 * @param fillColor - The new color to paint
 * @param options - Optional flags (respectBorders)
 * @returns FillResult with pixel count and affected tiles
 */
export function floodFill(
  engine: TileEngine,
  startX: number,
  startY: number,
  fillColor: RGB,
  options?: FloodFillOptions
): FillResult {
  const { width: mapWidth, height: mapHeight } = engine.getMapSize();
  const affectedTiles = new Set<number>();
  let pixelCount = 0;

  // Bounds check
  if (startX < 0 || startX >= mapWidth || startY < 0 || startY >= mapHeight) {
    return { pixelCount: 0, affectedTiles };
  }

  // Read target color at the start point
  const targetColor = engine.getPixel(startX, startY);

  // No-op if target is the same as fill
  if (colorsMatch(targetColor, fillColor)) {
    return { pixelCount: 0, affectedTiles };
  }

  // With respectBorders, only allow filling pixels considered "empty"
  if (options?.respectBorders) {
    const isEmptyColor = options.isEmptyColor ?? ((c: RGB) => c.r === 0 && c.g === 0 && c.b === 0);
    if (!isEmptyColor(targetColor)) {
      return { pixelCount: 0, affectedTiles };
    }
  }

  // With province lock, only allow filling pixels matching the locked color
  if (options?.isTargetColor) {
    if (!options.isTargetColor(targetColor)) {
      return { pixelCount: 0, affectedTiles };
    }
  }

  const tilesX = Math.ceil(mapWidth / TILE_SIZE);

  // Scanline stack: each entry is [x, y] — a seed point to scan from
  const stack: [number, number][] = [[startX, startY]];

  // Track visited scanlines to avoid re-processing
  // Key: "left,y" of each processed span
  const visited = new Set<string>();

  while (stack.length > 0) {
    const [seedX, seedY] = stack.pop()!;

    // Skip out-of-bounds seeds
    if (seedY < 0 || seedY >= mapHeight) continue;

    // Check if the seed pixel still matches target (may have been filled already)
    if (!colorsMatch(engine.getPixel(seedX, seedY), targetColor)) continue;

    // Find the leftmost extent of this span
    let left = seedX;
    while (left > 0 && colorsMatch(engine.getPixel(left - 1, seedY), targetColor)) {
      left--;
    }

    // Deduplicate: if we've already processed a span starting at this (left, seedY), skip
    const spanKey = `${left},${seedY}`;
    if (visited.has(spanKey)) continue;
    visited.add(spanKey);

    // Find the rightmost extent and fill the span
    let right = left;
    while (right < mapWidth && colorsMatch(engine.getPixel(right, seedY), targetColor)) {
      // Snapshot tile before its first modification (for undo)
      const tx = Math.floor(right / TILE_SIZE);
      const ty = Math.floor(seedY / TILE_SIZE);
      const tileIndex = ty * tilesX + tx;
      if (!affectedTiles.has(tileIndex)) {
        options?.onNewTile?.(tileIndex);
        affectedTiles.add(tileIndex);
      }

      engine.setPixel(right, seedY, fillColor);
      pixelCount++;

      right++;
    }
    // right is now one past the rightmost filled pixel

    // Scan the row above and below for new seed points
    for (const dy of [-1, 1]) {
      const ny = seedY + dy;
      if (ny < 0 || ny >= mapHeight) continue;

      // Walk the span [left, right) looking for contiguous runs of target color
      let x = left;
      while (x < right) {
        // Skip non-matching pixels
        if (!colorsMatch(engine.getPixel(x, ny), targetColor)) {
          x++;
          continue;
        }
        // Found a matching pixel — push it as a seed and skip the rest of this run
        stack.push([x, ny]);
        while (x < right && colorsMatch(engine.getPixel(x, ny), targetColor)) {
          x++;
        }
      }
    }
  }

  return { pixelCount, affectedTiles };
}

/**
 * Check if two RGB colors are identical.
 */
function colorsMatch(a: RGB, b: RGB): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}
