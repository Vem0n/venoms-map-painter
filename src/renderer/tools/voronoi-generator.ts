/**
 * Voronoi-based province auto-generator — pure algorithmic core.
 *
 * No UI or WebGL dependencies. Operates through the TileEngine's
 * getPixel/getMapSize abstraction and returns data structures that
 * the overlay writer and App.tsx confirm handler consume.
 */

import type { RGB } from '@shared/types';
import { rgbToKey } from '@shared/types';
import { TILE_SIZE } from '@shared/constants';
import type {
  RegionData, ComponentData, VoronoiSeed, VoronoiResult, ProgressCallback,
} from './voronoi-types';

/** Minimal interface for the engine methods we need — enables testing with mocks */
export interface PixelReader {
  getPixel(gx: number, gy: number): RGB;
  getMapSize(): { width: number; height: number };
}

/* ─── Phase 1: Collect Region Pixels ───────────────────────────── */

/**
 * Collect all pixels matching `targetColor` from the map.
 * Iterates tile-by-tile, yielding to the event loop between chunks.
 */
export async function collectRegionPixels(
  engine: PixelReader,
  targetColor: RGB,
  onProgress?: ProgressCallback,
  tileSubset?: ReadonlySet<number>,
): Promise<RegionData> {
  const { width, height } = engine.getMapSize();
  const targetKey = rgbToKey(targetColor);

  const pixelSet = new Set<string>();
  const pixels: [number, number][] = [];
  let minX = width, minY = height, maxX = 0, maxY = 0;

  const tilesX = Math.ceil(width / TILE_SIZE);
  const tilesY = Math.ceil(height / TILE_SIZE);
  const totalTiles = tilesX * tilesY;
  const chunkSize = 4;

  // Build tile index list: subset if provided, otherwise full range
  const tileIndices: number[] = tileSubset
    ? Array.from(tileSubset).sort((a, b) => a - b)
    : Array.from({ length: totalTiles }, (_, i) => i);
  const tileCount = tileIndices.length;
  let cursor = 0;

  await new Promise<void>((resolve) => {
    const processChunk = (): void => {
      const end = Math.min(cursor + chunkSize, tileCount);

      for (; cursor < end; cursor++) {
        const tileIdx = tileIndices[cursor];
        const tx = tileIdx % tilesX;
        const ty = Math.floor(tileIdx / tilesX);
        const baseX = tx * TILE_SIZE;
        const baseY = ty * TILE_SIZE;
        const validW = Math.min(TILE_SIZE, width - baseX);
        const validH = Math.min(TILE_SIZE, height - baseY);

        for (let ly = 0; ly < validH; ly++) {
          for (let lx = 0; lx < validW; lx++) {
            const gx = baseX + lx;
            const gy = baseY + ly;
            const px = engine.getPixel(gx, gy);
            if (rgbToKey(px) === targetKey) {
              const key = `${gx},${gy}`;
              pixelSet.add(key);
              pixels.push([gx, gy]);
              if (gx < minX) minX = gx;
              if (gy < minY) minY = gy;
              if (gx > maxX) maxX = gx;
              if (gy > maxY) maxY = gy;
            }
          }
        }
      }

      onProgress?.('Collecting pixels', cursor / tileCount);

      if (cursor < tileCount) {
        setTimeout(processChunk, 0);
      } else {
        resolve();
      }
    };
    processChunk();
  });

  // Detect connected components
  const components = detectComponents(pixelSet);

  return {
    pixelSet,
    pixels,
    bounds: { minX, minY, maxX, maxY },
    count: pixels.length,
    components,
  };
}

/* ─── Phase 1b: Detect Connected Components ────────────────────── */

/**
 * BFS over the pixel set to find connected components.
 * Uses 4-connectivity (up/down/left/right).
 * Returns components sorted by pixel count descending.
 */
export function detectComponents(pixelSet: Set<string>): ComponentData[] {
  const visited = new Set<string>();
  const components: ComponentData[] = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (const key of pixelSet) {
    if (visited.has(key)) continue;

    // BFS from this unvisited pixel
    const compPixels: [number, number][] = [];
    const compSet = new Set<string>();
    const queue: string[] = [key];
    visited.add(key);

    while (queue.length > 0) {
      const curr = queue.pop()!;
      const commaIdx = curr.indexOf(',');
      const cx = parseInt(curr.substring(0, commaIdx), 10);
      const cy = parseInt(curr.substring(commaIdx + 1), 10);
      compPixels.push([cx, cy]);
      compSet.add(curr);

      for (const [dx, dy] of dirs) {
        const nk = `${cx + dx},${cy + dy}`;
        if (pixelSet.has(nk) && !visited.has(nk)) {
          visited.add(nk);
          queue.push(nk);
        }
      }
    }

    components.push({ pixels: compPixels, pixelSet: compSet, count: compPixels.length });
  }

  // Sort largest first
  components.sort((a, b) => b.count - a.count);
  return components;
}

/* ─── Phase 2: Generate Seeds (Segment-Aware) ──────────────────── */

/**
 * Distribute `count` seed points proportionally across connected components.
 * Every component with enough pixels gets at least 1 seed.
 * Within each component, seeds are placed randomly then refined with
 * 3 iterations of Lloyd's relaxation.
 */
export function generateSeeds(
  region: RegionData,
  count: number,
  rng: () => number,
): VoronoiSeed[] {
  const effectiveCount = Math.min(count, region.count);
  if (effectiveCount <= 0) return [];

  const { components } = region;
  if (components.length === 0) return [];

  // Distribute seeds proportionally, ensuring at least 1 per component (if possible)
  const seedCounts = distributeSeedCounts(components, effectiveCount);
  const seeds: VoronoiSeed[] = [];
  let nextRegionId = 0;

  for (let ci = 0; ci < components.length; ci++) {
    const comp = components[ci];
    const numSeeds = seedCounts[ci];
    if (numSeeds === 0) continue;

    // Place seeds randomly within this component
    const compSeeds = placeRandomSeeds(comp, numSeeds, nextRegionId, rng);

    // Lloyd's relaxation: 3 iterations for better distribution
    const relaxed = lloydRelax(comp, compSeeds, 3);
    seeds.push(...relaxed);
    nextRegionId += numSeeds;
  }

  return seeds;
}

/** Distribute N seeds across components proportionally by pixel count */
function distributeSeedCounts(components: ComponentData[], total: number): number[] {
  const counts = new Array(components.length).fill(0);
  const totalPixels = components.reduce((s, c) => s + c.count, 0);
  if (totalPixels === 0) return counts;

  // First pass: proportional allocation
  let allocated = 0;
  for (let i = 0; i < components.length; i++) {
    const fraction = components[i].count / totalPixels;
    counts[i] = Math.floor(fraction * total);
    allocated += counts[i];
  }

  // Ensure every component gets at least 1 seed (if total allows)
  for (let i = 0; i < components.length && allocated < total; i++) {
    if (counts[i] === 0 && components[i].count > 0) {
      counts[i] = 1;
      allocated++;
    }
  }

  // Distribute remainder to largest components
  let remainder = total - allocated;
  let idx = 0;
  while (remainder > 0 && idx < components.length) {
    counts[idx]++;
    remainder--;
    idx++;
    if (idx >= components.length) idx = 0;
  }

  return counts;
}

/** Place `n` random seeds within a component */
function placeRandomSeeds(
  comp: ComponentData,
  n: number,
  startRegionId: number,
  rng: () => number,
): VoronoiSeed[] {
  const seeds: VoronoiSeed[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < n; i++) {
    let idx: number;
    let attempts = 0;
    do {
      idx = Math.floor(rng() * comp.pixels.length);
      attempts++;
    } while (usedIndices.has(idx) && attempts < 1000);

    usedIndices.add(idx);
    const [x, y] = comp.pixels[idx];
    seeds.push({ x, y, regionId: startRegionId + i });
  }

  return seeds;
}

/**
 * Lloyd's relaxation: move each seed to the centroid of its assigned pixels,
 * snapping back to the nearest in-component pixel.
 */
function lloydRelax(
  comp: ComponentData,
  seeds: VoronoiSeed[],
  iterations: number,
): VoronoiSeed[] {
  let current = seeds.slice();

  for (let iter = 0; iter < iterations; iter++) {
    // Assign each pixel to nearest seed (simple Euclidean within component)
    const sumX = new Float64Array(current.length);
    const sumY = new Float64Array(current.length);
    const count = new Float64Array(current.length);

    for (const [px, py] of comp.pixels) {
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let si = 0; si < current.length; si++) {
        const dx = px - current[si].x;
        const dy = py - current[si].y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = si;
        }
      }
      sumX[bestIdx] += px;
      sumY[bestIdx] += py;
      count[bestIdx]++;
    }

    // Move seeds to centroids, snap to nearest component pixel
    current = current.map((seed, si) => {
      if (count[si] === 0) return seed; // No pixels assigned — keep position
      const cx = sumX[si] / count[si];
      const cy = sumY[si] / count[si];
      const snapped = snapToNearest(comp, cx, cy);
      return { ...seed, x: snapped[0], y: snapped[1] };
    });
  }

  return current;
}

/** Find the nearest pixel in the component to the given floating-point position */
function snapToNearest(comp: ComponentData, fx: number, fy: number): [number, number] {
  let bestDist = Infinity;
  let best: [number, number] = comp.pixels[0];

  for (const [px, py] of comp.pixels) {
    const dx = px - fx;
    const dy = py - fy;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = [px, py];
    }
  }

  return best;
}

/* ─── Phase 3: Multi-Source BFS Assignment ─────────────────────── */

/**
 * Assign every region pixel to the nearest reachable seed using BFS.
 * Only expands through pixels in the region (respects barriers).
 * Then detects boundary pixels.
 */
export function assignVoronoi(
  region: RegionData,
  seeds: VoronoiSeed[],
): VoronoiResult {
  if (seeds.length === 0) {
    return {
      assignment: new Map(),
      seeds: [],
      boundaryPixels: new Set(),
      actualRegionCount: 0,
      regionSizes: [],
    };
  }

  const assignment = new Map<string, number>();
  const regionSizes = new Array(seeds.length).fill(0) as number[];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // BFS queue: [x, y, regionId]
  const queue: [number, number, number][] = [];

  // Initialize with all seeds
  for (const seed of seeds) {
    const key = `${seed.x},${seed.y}`;
    if (region.pixelSet.has(key) && !assignment.has(key)) {
      assignment.set(key, seed.regionId);
      regionSizes[seed.regionId]++;
      queue.push([seed.x, seed.y, seed.regionId]);
    }
  }

  // BFS expansion
  let head = 0;
  while (head < queue.length) {
    const [cx, cy, rid] = queue[head++];

    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nk = `${nx},${ny}`;

      if (region.pixelSet.has(nk) && !assignment.has(nk)) {
        assignment.set(nk, rid);
        regionSizes[rid]++;
        queue.push([nx, ny, rid]);
      }
    }
  }

  // Fallback: assign unreachable pixels to nearest seed by Euclidean distance
  for (const [px, py] of region.pixels) {
    const key = `${px},${py}`;
    if (!assignment.has(key)) {
      let bestDist = Infinity;
      let bestRid = 0;
      for (const seed of seeds) {
        const dx = px - seed.x;
        const dy = py - seed.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          bestRid = seed.regionId;
        }
      }
      assignment.set(key, bestRid);
      regionSizes[bestRid]++;
    }
  }

  // Boundary detection: pixel is boundary if any 4-neighbor has different regionId or is outside region
  const boundaryPixels = new Set<string>();
  for (const [key, rid] of assignment) {
    const commaIdx = key.indexOf(',');
    const cx = parseInt(key.substring(0, commaIdx), 10);
    const cy = parseInt(key.substring(commaIdx + 1), 10);

    for (const [dx, dy] of dirs) {
      const nk = `${cx + dx},${cy + dy}`;
      const neighborRid = assignment.get(nk);
      if (neighborRid === undefined || neighborRid !== rid) {
        boundaryPixels.add(key);
        break;
      }
    }
  }

  // Count actual unique regions that have pixels
  let actualRegionCount = 0;
  for (const size of regionSizes) {
    if (size > 0) actualRegionCount++;
  }

  return {
    assignment,
    seeds,
    boundaryPixels,
    actualRegionCount,
    regionSizes,
  };
}

/* ─── Seeded PRNG ──────────────────────────────────────────────── */

/**
 * Mulberry32 — simple, fast, seeded 32-bit PRNG.
 * Returns values in [0, 1).
 */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
