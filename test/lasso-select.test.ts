import { describe, it, expect } from 'vitest';
import {
  pointInPolygon,
  collectLassoColors,
  getColorAtPoint,
} from '@tools/lasso-select';
import type { LassoPoint } from '@tools/lasso-select';
import type { RGB } from '@shared/types';
import { rgbToKey } from '@shared/types';

/* ═══════════════════════════════════════════════════════════════════ */
/*  Mock TileEngine                                                   */
/* ═══════════════════════════════════════════════════════════════════ */

/** Minimal mock of TileEngine with a 2D pixel grid — no WebGL needed. */
function createMockEngine(width: number, height: number, fill: RGB = { r: 0, g: 0, b: 0 }) {
  const pixels: RGB[][] = [];
  for (let y = 0; y < height; y++) {
    pixels[y] = [];
    for (let x = 0; x < width; x++) {
      pixels[y][x] = { ...fill };
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

/** Paint a rectangle on the mock engine. */
function paintRect(
  engine: ReturnType<typeof createMockEngine>,
  x: number, y: number, w: number, h: number, color: RGB,
) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const py = y + dy, px = x + dx;
      if (py >= 0 && py < engine.pixels.length && px >= 0 && px < engine.pixels[0].length) {
        engine.pixels[py][px] = { ...color };
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  pointInPolygon                                                    */
/* ═══════════════════════════════════════════════════════════════════ */

describe('pointInPolygon', () => {
  // Simple right triangle: (0,0) → (10,0) → (0,10)
  const triangle: LassoPoint[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];

  it('returns true for a point inside a triangle', () => {
    expect(pointInPolygon(2, 2, triangle)).toBe(true);
  });

  it('returns false for a point outside a triangle', () => {
    expect(pointInPolygon(8, 8, triangle)).toBe(false);
  });

  it('returns false for fewer than 3 points (degenerate)', () => {
    expect(pointInPolygon(0, 0, [])).toBe(false);
    expect(pointInPolygon(0, 0, [{ x: 0, y: 0 }])).toBe(false);
    expect(pointInPolygon(0, 0, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });

  it('handles a square polygon', () => {
    const square: LassoPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    expect(pointInPolygon(5, 5, square)).toBe(true);   // center
    expect(pointInPolygon(1, 1, square)).toBe(true);   // near corner
    expect(pointInPolygon(11, 5, square)).toBe(false);  // right of square
    expect(pointInPolygon(-1, 5, square)).toBe(false);  // left of square
  });

  it('handles a concave (L-shaped) polygon', () => {
    // L-shape: bottom-left + top arm cut away
    const lShape: LassoPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];

    expect(pointInPolygon(2, 2, lShape)).toBe(true);   // bottom-left
    expect(pointInPolygon(8, 2, lShape)).toBe(true);   // bottom-right arm
    expect(pointInPolygon(2, 8, lShape)).toBe(true);   // top-left arm
    expect(pointInPolygon(8, 8, lShape)).toBe(false);  // cut-away area
  });

  it('returns false for a point far away from the polygon', () => {
    expect(pointInPolygon(100, 100, triangle)).toBe(false);
    expect(pointInPolygon(-50, -50, triangle)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  collectLassoColors                                                */
/* ═══════════════════════════════════════════════════════════════════ */

describe('collectLassoColors', () => {
  const red: RGB = { r: 255, g: 0, b: 0 };
  const green: RGB = { r: 0, g: 255, b: 0 };
  const blue: RGB = { r: 0, g: 0, b: 255 };
  const black: RGB = { r: 0, g: 0, b: 0 };

  it('collects a single province color inside the lasso', async () => {
    const engine = createMockEngine(20, 20);
    paintRect(engine, 5, 5, 10, 10, red);

    // Lasso polygon that fully encloses the red block
    const polygon: LassoPoint[] = [
      { x: 3, y: 3 },
      { x: 17, y: 3 },
      { x: 17, y: 17 },
      { x: 3, y: 17 },
    ];

    const emptyColors = new Set([rgbToKey(black)]);
    const result = await collectLassoColors(engine as never, polygon, emptyColors);

    expect(result.colors.size).toBe(1);
    expect(result.colors.has(rgbToKey(red))).toBe(true);
  });

  it('collects multiple province colors', async () => {
    const engine = createMockEngine(20, 20);
    paintRect(engine, 2, 2, 6, 6, red);
    paintRect(engine, 10, 2, 6, 6, green);
    paintRect(engine, 6, 10, 6, 6, blue);

    // Large lasso that covers everything
    const polygon: LassoPoint[] = [
      { x: 0, y: 0 },
      { x: 19, y: 0 },
      { x: 19, y: 19 },
      { x: 0, y: 19 },
    ];

    const emptyColors = new Set([rgbToKey(black)]);
    const result = await collectLassoColors(engine as never, polygon, emptyColors);

    expect(result.colors.size).toBe(3);
    expect(result.colors.has(rgbToKey(red))).toBe(true);
    expect(result.colors.has(rgbToKey(green))).toBe(true);
    expect(result.colors.has(rgbToKey(blue))).toBe(true);
  });

  it('excludes empty colors', async () => {
    const engine = createMockEngine(10, 10, red); // entire map is red
    paintRect(engine, 4, 4, 2, 2, green);

    const polygon: LassoPoint[] = [
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 9 },
      { x: 0, y: 9 },
    ];

    // Treat red as "empty" — should only collect green
    const emptyColors = new Set([rgbToKey(red)]);
    const result = await collectLassoColors(engine as never, polygon, emptyColors);

    expect(result.colors.size).toBe(1);
    expect(result.colors.has(rgbToKey(green))).toBe(true);
    expect(result.colors.has(rgbToKey(red))).toBe(false);
  });

  it('returns empty set when lasso covers only empty pixels', async () => {
    const engine = createMockEngine(10, 10); // all black

    const polygon: LassoPoint[] = [
      { x: 1, y: 1 },
      { x: 8, y: 1 },
      { x: 8, y: 8 },
      { x: 1, y: 8 },
    ];

    const emptyColors = new Set([rgbToKey(black)]);
    const result = await collectLassoColors(engine as never, polygon, emptyColors);

    expect(result.colors.size).toBe(0);
  });

  it('clamps bounds to map dimensions', async () => {
    const engine = createMockEngine(10, 10);
    paintRect(engine, 0, 0, 10, 10, red);

    // Polygon extends beyond map borders
    const polygon: LassoPoint[] = [
      { x: -5, y: -5 },
      { x: 15, y: -5 },
      { x: 15, y: 15 },
      { x: -5, y: 15 },
    ];

    const emptyColors = new Set<string>();
    const result = await collectLassoColors(engine as never, polygon, emptyColors);

    // Should still collect red (and black around edges) — bounds clamped to [0, 9]
    expect(result.bounds.minX).toBe(0);
    expect(result.bounds.minY).toBe(0);
    expect(result.bounds.maxX).toBe(9);
    expect(result.bounds.maxY).toBe(9);
    expect(result.colors.has(rgbToKey(red))).toBe(true);
  });

  it('handles a triangular lasso (non-rectangular)', async () => {
    const engine = createMockEngine(20, 20);
    // Paint the whole map with a province color
    paintRect(engine, 0, 0, 20, 20, green);

    // Small triangle
    const polygon: LassoPoint[] = [
      { x: 10, y: 2 },
      { x: 18, y: 18 },
      { x: 2, y: 18 },
    ];

    const emptyColors = new Set<string>();
    const result = await collectLassoColors(engine as never, polygon, emptyColors);

    expect(result.colors.size).toBe(1);
    expect(result.colors.has(rgbToKey(green))).toBe(true);
    // Bounds should reflect the triangle extents
    expect(result.bounds.minX).toBe(2);
    expect(result.bounds.minY).toBe(2);
    expect(result.bounds.maxX).toBe(18);
    expect(result.bounds.maxY).toBe(18);
  });

  it('only collects provinces partially inside the lasso', async () => {
    const engine = createMockEngine(20, 20);
    // Red province: left half
    paintRect(engine, 0, 0, 10, 20, red);
    // Green province: right half
    paintRect(engine, 10, 0, 10, 20, green);

    // Lasso covers only the center, touching both provinces
    const polygon: LassoPoint[] = [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ];

    const emptyColors = new Set<string>();
    const result = await collectLassoColors(engine as never, polygon, emptyColors);

    expect(result.colors.size).toBe(2);
    expect(result.colors.has(rgbToKey(red))).toBe(true);
    expect(result.colors.has(rgbToKey(green))).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  getColorAtPoint                                                   */
/* ═══════════════════════════════════════════════════════════════════ */

describe('getColorAtPoint', () => {
  const red: RGB = { r: 255, g: 0, b: 0 };
  const black: RGB = { r: 0, g: 0, b: 0 };

  it('returns the color key for a province pixel', () => {
    const engine = createMockEngine(10, 10);
    paintRect(engine, 3, 3, 4, 4, red);

    const emptyColors = new Set([rgbToKey(black)]);
    const result = getColorAtPoint(engine as never, 5, 5, emptyColors);

    expect(result).toBe(rgbToKey(red));
  });

  it('returns null for an empty color pixel', () => {
    const engine = createMockEngine(10, 10); // all black
    const emptyColors = new Set([rgbToKey(black)]);

    const result = getColorAtPoint(engine as never, 5, 5, emptyColors);

    expect(result).toBeNull();
  });

  it('returns null for out-of-bounds coordinates', () => {
    const engine = createMockEngine(10, 10);
    const emptyColors = new Set<string>();

    expect(getColorAtPoint(engine as never, -1, 5, emptyColors)).toBeNull();
    expect(getColorAtPoint(engine as never, 5, -1, emptyColors)).toBeNull();
    expect(getColorAtPoint(engine as never, 10, 5, emptyColors)).toBeNull();
    expect(getColorAtPoint(engine as never, 5, 10, emptyColors)).toBeNull();
  });

  it('returns the correct color at map edge pixels', () => {
    const engine = createMockEngine(10, 10);
    paintRect(engine, 0, 0, 10, 10, red);

    const emptyColors = new Set<string>();

    expect(getColorAtPoint(engine as never, 0, 0, emptyColors)).toBe(rgbToKey(red));
    expect(getColorAtPoint(engine as never, 9, 9, emptyColors)).toBe(rgbToKey(red));
    expect(getColorAtPoint(engine as never, 0, 9, emptyColors)).toBe(rgbToKey(red));
    expect(getColorAtPoint(engine as never, 9, 0, emptyColors)).toBe(rgbToKey(red));
  });
});
