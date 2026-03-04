import { describe, it, expect } from 'vitest';
import {
  collectRegionPixels,
  detectComponents,
  generateSeeds,
  assignVoronoi,
  createRng,
} from '@tools/voronoi-generator';
import type { PixelReader } from '@tools/voronoi-generator';
import type { RGB } from '@shared/types';
import type { RegionData, ComponentData } from '@tools/voronoi-types';

/**
 * Mock PixelReader — a simple pixel grid for testing.
 * No WebGL, just a 2D array of RGB values.
 */
function createMockReader(width: number, height: number, initialColor: RGB = { r: 0, g: 0, b: 0 }): PixelReader & { pixels: RGB[][] } {
  const pixels: RGB[][] = [];
  for (let y = 0; y < height; y++) {
    pixels[y] = [];
    for (let x = 0; x < width; x++) {
      pixels[y][x] = { ...initialColor };
    }
  }

  return {
    pixels,
    getMapSize: () => ({ width, height }),
    getPixel: (x: number, y: number): RGB => {
      if (x < 0 || x >= width || y < 0 || y >= height) return { r: 0, g: 0, b: 0 };
      return pixels[y][x];
    },
  };
}

/** Paint a rectangle on the mock reader */
function setRect(reader: ReturnType<typeof createMockReader>, x: number, y: number, w: number, h: number, color: RGB) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (y + dy < reader.pixels.length && x + dx < reader.pixels[0].length) {
        reader.pixels[y + dy][x + dx] = { ...color };
      }
    }
  }
}

/** Build a RegionData from a pixel set (for testing functions that take RegionData) */
function buildRegion(pixelSet: Set<string>): RegionData {
  const pixels: [number, number][] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const key of pixelSet) {
    const [xStr, yStr] = key.split(',');
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    pixels.push([x, y]);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const components = detectComponents(pixelSet);

  return {
    pixelSet,
    pixels,
    bounds: { minX, minY, maxX, maxY },
    count: pixels.length,
    components,
  };
}

/** Create a pixel set from a rectangular region */
function makeRectPixelSet(x: number, y: number, w: number, h: number): Set<string> {
  const set = new Set<string>();
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      set.add(`${x + dx},${y + dy}`);
    }
  }
  return set;
}

/* ═══════════════════════════════════════════════════════════════════ */

describe('createRng', () => {
  it('produces deterministic output for the same seed', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('produces values in [0, 1)', () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createRng(1);
    const rng2 = createRng(2);
    const seq1 = Array.from({ length: 5 }, () => rng1());
    const seq2 = Array.from({ length: 5 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */

describe('collectRegionPixels', () => {
  it('collects all pixels of a 10x10 red block', async () => {
    const reader = createMockReader(20, 20);
    const red: RGB = { r: 255, g: 0, b: 0 };
    setRect(reader, 5, 5, 10, 10, red);

    const region = await collectRegionPixels(reader, red);

    expect(region.count).toBe(100);
    expect(region.pixels).toHaveLength(100);
    expect(region.pixelSet.size).toBe(100);
    expect(region.bounds).toEqual({ minX: 5, minY: 5, maxX: 14, maxY: 14 });
  });

  it('excludes pixels of a different color', async () => {
    const reader = createMockReader(10, 10);
    const red: RGB = { r: 255, g: 0, b: 0 };
    const blue: RGB = { r: 0, g: 0, b: 255 };
    setRect(reader, 0, 0, 10, 10, red);
    // Blue patch in the middle
    setRect(reader, 3, 3, 4, 4, blue);

    const region = await collectRegionPixels(reader, red);

    // 10x10 = 100 total, minus 4x4 = 16 blue = 84 red
    expect(region.count).toBe(84);
  });

  it('returns empty region when no matching pixels exist', async () => {
    const reader = createMockReader(10, 10);
    const red: RGB = { r: 255, g: 0, b: 0 };

    const region = await collectRegionPixels(reader, red);

    expect(region.count).toBe(0);
    expect(region.pixels).toHaveLength(0);
    expect(region.components).toHaveLength(0);
  });

  it('detects connected components during collection', async () => {
    const reader = createMockReader(20, 10);
    const red: RGB = { r: 255, g: 0, b: 0 };
    // Two separate red blocks with a gap between them
    setRect(reader, 0, 0, 5, 10, red);   // Left block (50 pixels)
    setRect(reader, 10, 0, 5, 10, red);  // Right block (50 pixels)

    const region = await collectRegionPixels(reader, red);

    expect(region.count).toBe(100);
    expect(region.components).toHaveLength(2);
    expect(region.components[0].count).toBe(50);
    expect(region.components[1].count).toBe(50);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */

describe('detectComponents', () => {
  it('finds a single connected region', () => {
    const pixels = makeRectPixelSet(0, 0, 5, 5);
    const components = detectComponents(pixels);

    expect(components).toHaveLength(1);
    expect(components[0].count).toBe(25);
  });

  it('finds two disconnected rectangles', () => {
    const set1 = makeRectPixelSet(0, 0, 5, 5);
    const set2 = makeRectPixelSet(10, 10, 3, 3);
    const combined = new Set([...set1, ...set2]);

    const components = detectComponents(combined);

    expect(components).toHaveLength(2);
    // Sorted by size descending
    expect(components[0].count).toBe(25);
    expect(components[1].count).toBe(9);
  });

  it('finds four segments from a region split by a cross barrier', () => {
    // 11x11 grid, all filled except the center cross (row 5 and col 5)
    const pixelSet = new Set<string>();
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        if (x !== 5 && y !== 5) {
          pixelSet.add(`${x},${y}`);
        }
      }
    }

    const components = detectComponents(pixelSet);

    expect(components).toHaveLength(4);
    // Each quadrant is 5x5 = 25
    for (const comp of components) {
      expect(comp.count).toBe(25);
    }
  });

  it('returns empty array for empty pixel set', () => {
    const components = detectComponents(new Set());
    expect(components).toHaveLength(0);
  });

  it('handles single pixel component', () => {
    const pixelSet = new Set(['5,5']);
    const components = detectComponents(pixelSet);

    expect(components).toHaveLength(1);
    expect(components[0].count).toBe(1);
    expect(components[0].pixels[0]).toEqual([5, 5]);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */

describe('generateSeeds', () => {
  it('generates the requested number of seeds', () => {
    const region = buildRegion(makeRectPixelSet(0, 0, 20, 20));
    const rng = createRng(42);

    const seeds = generateSeeds(region, 10, rng);

    expect(seeds).toHaveLength(10);
  });

  it('all seeds are within the region', () => {
    const pixelSet = makeRectPixelSet(5, 5, 10, 10);
    const region = buildRegion(pixelSet);
    const rng = createRng(42);

    const seeds = generateSeeds(region, 5, rng);

    for (const seed of seeds) {
      expect(pixelSet.has(`${seed.x},${seed.y}`)).toBe(true);
    }
  });

  it('each seed has a unique regionId', () => {
    const region = buildRegion(makeRectPixelSet(0, 0, 20, 20));
    const rng = createRng(42);

    const seeds = generateSeeds(region, 8, rng);
    const ids = seeds.map(s => s.regionId);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(8);
  });

  it('caps seed count at region size when count > pixels', () => {
    const region = buildRegion(makeRectPixelSet(0, 0, 3, 3)); // 9 pixels
    const rng = createRng(42);

    const seeds = generateSeeds(region, 50, rng);

    expect(seeds.length).toBeLessThanOrEqual(9);
    expect(seeds.length).toBeGreaterThan(0);
  });

  it('distributes seeds across components proportionally', () => {
    // Component 1: 100 pixels (large), Component 2: 25 pixels (small)
    const set1 = makeRectPixelSet(0, 0, 10, 10);    // 100 pixels
    const set2 = makeRectPixelSet(15, 0, 5, 5);     // 25 pixels
    const combined = new Set([...set1, ...set2]);
    const region = buildRegion(combined);

    expect(region.components).toHaveLength(2);

    const rng = createRng(42);
    const seeds = generateSeeds(region, 10, rng);

    // Count seeds per component
    const comp1Seeds = seeds.filter(s => set1.has(`${s.x},${s.y}`)).length;
    const comp2Seeds = seeds.filter(s => set2.has(`${s.x},${s.y}`)).length;

    expect(seeds).toHaveLength(10);
    // Larger component should get more seeds
    expect(comp1Seeds).toBeGreaterThan(comp2Seeds);
    // Both components should have at least 1 seed
    expect(comp1Seeds).toBeGreaterThanOrEqual(1);
    expect(comp2Seeds).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for empty region', () => {
    const region = buildRegion(new Set());
    const rng = createRng(42);

    const seeds = generateSeeds(region, 10, rng);

    expect(seeds).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */

describe('assignVoronoi', () => {
  it('assigns all pixels with a single seed to region 0', () => {
    const pixelSet = makeRectPixelSet(0, 0, 10, 10);
    const region = buildRegion(pixelSet);

    const seeds = [{ x: 5, y: 5, regionId: 0 }];
    const result = assignVoronoi(region, seeds);

    expect(result.assignment.size).toBe(100);
    expect(result.actualRegionCount).toBe(1);
    expect(result.regionSizes[0]).toBe(100);

    // All assigned to region 0
    for (const [, rid] of result.assignment) {
      expect(rid).toBe(0);
    }
  });

  it('creates two roughly equal regions from opposite seeds', () => {
    const pixelSet = makeRectPixelSet(0, 0, 20, 10);
    const region = buildRegion(pixelSet);

    // Seeds at far left and far right
    const seeds = [
      { x: 0, y: 5, regionId: 0 },
      { x: 19, y: 5, regionId: 1 },
    ];
    const result = assignVoronoi(region, seeds);

    expect(result.assignment.size).toBe(200);
    expect(result.actualRegionCount).toBe(2);

    // Each region should be roughly half (100 ± some)
    expect(result.regionSizes[0]).toBeGreaterThan(50);
    expect(result.regionSizes[1]).toBeGreaterThan(50);
    expect(result.regionSizes[0] + result.regionSizes[1]).toBe(200);
  });

  it('respects barriers — seeds cannot cross a gap', () => {
    // 10x20 region with a 1-pixel gap at column 10 (all black)
    // Left half: columns 0-9 (100 pixels), Right half: columns 11-20 (100 pixels)
    const pixelSet = new Set<string>();
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 21; x++) {
        if (x !== 10) {
          pixelSet.add(`${x},${y}`);
        }
      }
    }
    const region = buildRegion(pixelSet);

    // Seed in left half, seed in right half
    const seeds = [
      { x: 5, y: 5, regionId: 0 },
      { x: 15, y: 5, regionId: 1 },
    ];
    const result = assignVoronoi(region, seeds);

    // Left half should be entirely region 0
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        expect(result.assignment.get(`${x},${y}`)).toBe(0);
      }
    }

    // Right half should be entirely region 1
    for (let y = 0; y < 10; y++) {
      for (let x = 11; x < 21; x++) {
        expect(result.assignment.get(`${x},${y}`)).toBe(1);
      }
    }

    expect(result.regionSizes[0]).toBe(100);
    expect(result.regionSizes[1]).toBe(100);
  });

  it('detects boundary pixels between regions', () => {
    const pixelSet = makeRectPixelSet(0, 0, 10, 10);
    const region = buildRegion(pixelSet);

    const seeds = [
      { x: 2, y: 5, regionId: 0 },
      { x: 7, y: 5, regionId: 1 },
    ];
    const result = assignVoronoi(region, seeds);

    // There should be boundary pixels between the two regions
    expect(result.boundaryPixels.size).toBeGreaterThan(0);

    // Boundary pixels at region edges (border of the 10x10 grid) and
    // between the two Voronoi regions
    for (const key of result.boundaryPixels) {
      expect(result.assignment.has(key)).toBe(true);
    }
  });

  it('single seed has no internal boundaries (only edge boundaries)', () => {
    const pixelSet = makeRectPixelSet(0, 0, 5, 5);
    const region = buildRegion(pixelSet);

    const seeds = [{ x: 2, y: 2, regionId: 0 }];
    const result = assignVoronoi(region, seeds);

    // All assigned to region 0
    expect(result.actualRegionCount).toBe(1);

    // Boundary pixels are those at the edge of the region (neighbors outside)
    // In a 5x5 grid, edge pixels = 5*4 - 4 = 16
    // Interior pixels (not on edge) = 3*3 = 9, so boundary count = 25 - 9 = 16
    expect(result.boundaryPixels.size).toBe(16);
  });

  it('returns empty result for no seeds', () => {
    const pixelSet = makeRectPixelSet(0, 0, 5, 5);
    const region = buildRegion(pixelSet);

    const result = assignVoronoi(region, []);

    expect(result.assignment.size).toBe(0);
    expect(result.actualRegionCount).toBe(0);
    expect(result.boundaryPixels.size).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */

describe('full pipeline', () => {
  it('collect + generate + assign produces consistent output', async () => {
    const reader = createMockReader(30, 30);
    const red: RGB = { r: 200, g: 50, b: 50 };
    setRect(reader, 2, 2, 20, 20, red);

    // Phase 1: collect
    const region = await collectRegionPixels(reader, red);
    expect(region.count).toBe(400); // 20x20

    // Phase 2: generate seeds
    const rng = createRng(42);
    const seeds = generateSeeds(region, 5, rng);
    expect(seeds).toHaveLength(5);

    // Phase 3: assign
    const result = assignVoronoi(region, seeds);

    // All pixels assigned
    expect(result.assignment.size).toBe(400);

    // Region sizes sum to total
    const totalAssigned = result.regionSizes.reduce((a, b) => a + b, 0);
    expect(totalAssigned).toBe(400);

    // All regions have pixels
    expect(result.actualRegionCount).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(result.regionSizes[i]).toBeGreaterThan(0);
    }

    // Boundary pixels exist between regions
    expect(result.boundaryPixels.size).toBeGreaterThan(0);
  });

  it('handles a region split by a barrier correctly', async () => {
    const reader = createMockReader(30, 10);
    const red: RGB = { r: 100, g: 200, b: 100 };
    const barrier: RGB = { r: 0, g: 0, b: 255 };

    // Left block and right block separated by a blue barrier column at x=15
    setRect(reader, 0, 0, 15, 10, red);   // 150 pixels
    setRect(reader, 15, 0, 1, 10, barrier); // barrier
    setRect(reader, 16, 0, 14, 10, red);  // 140 pixels

    const region = await collectRegionPixels(reader, red);
    expect(region.count).toBe(290);
    expect(region.components).toHaveLength(2);

    const rng = createRng(99);
    const seeds = generateSeeds(region, 4, rng);
    expect(seeds).toHaveLength(4);

    const result = assignVoronoi(region, seeds);
    expect(result.assignment.size).toBe(290);

    const totalAssigned = result.regionSizes.reduce((a, b) => a + b, 0);
    expect(totalAssigned).toBe(290);
  });
});
