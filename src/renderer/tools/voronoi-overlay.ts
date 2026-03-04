/**
 * Voronoi Overlay Writer — bridges VoronoiResult to the TileEngine overlay system.
 *
 * Draws boundary lines and optional seed markers as overlay pixels
 * that are rendered via the shader overlay (zero impact on actual map data).
 */

import type { TileEngine } from '@engine/tile-engine';
import type { VoronoiResult } from './voronoi-types';

interface OverlayOptions {
  /** Boundary line color (default: white) */
  boundaryColor?: { r: number; g: number; b: number; a: number };
  /** Whether to draw markers at seed positions */
  showSeeds?: boolean;
  /** Radius of seed markers in pixels (default: 3) */
  seedRadius?: number;
  /** Seed marker color (default: red) */
  seedColor?: { r: number; g: number; b: number; a: number };
}

const DEFAULT_BOUNDARY = { r: 255, g: 255, b: 255, a: 200 };
const DEFAULT_SEED_COLOR = { r: 255, g: 60, b: 60, a: 230 };

/**
 * Write Voronoi boundary pixels (and optional seed markers) to the engine overlay.
 * Call `engine.setOverlayVisible(true)` after this to make them visible.
 */
export function writeVoronoiOverlay(
  engine: TileEngine,
  result: VoronoiResult,
  options?: OverlayOptions,
): void {
  const bc = options?.boundaryColor ?? DEFAULT_BOUNDARY;
  const showSeeds = options?.showSeeds ?? true;
  const seedRadius = options?.seedRadius ?? 3;
  const sc = options?.seedColor ?? DEFAULT_SEED_COLOR;

  // Draw boundary pixels
  for (const key of result.boundaryPixels) {
    const commaIdx = key.indexOf(',');
    const x = parseInt(key.substring(0, commaIdx), 10);
    const y = parseInt(key.substring(commaIdx + 1), 10);
    engine.setOverlayPixel(x, y, bc.r, bc.g, bc.b, bc.a);
  }

  // Draw seed markers as small filled circles
  if (showSeeds) {
    const r2 = seedRadius * seedRadius;
    for (const seed of result.seeds) {
      for (let dy = -seedRadius; dy <= seedRadius; dy++) {
        for (let dx = -seedRadius; dx <= seedRadius; dx++) {
          if (dx * dx + dy * dy <= r2) {
            engine.setOverlayPixel(seed.x + dx, seed.y + dy, sc.r, sc.g, sc.b, sc.a);
          }
        }
      }
    }
  }
}
