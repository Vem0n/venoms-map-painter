import { describe, it, expect, vi } from 'vitest';
import { floodFill } from '@tools/flood-fill';
import type { RGB } from '@shared/types';

/**
 * Mock TileEngine — a simple pixel grid for testing flood fill.
 * No WebGL, just a 2D array of RGB values.
 */
function createMockEngine(width: number, height: number, initialColor: RGB = { r: 0, g: 0, b: 0 }) {
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
    setPixel: (x: number, y: number, color: RGB) => {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        pixels[y][x] = { ...color };
      }
    },
  } as any; // Cast to TileEngine interface
}

function setRect(engine: ReturnType<typeof createMockEngine>, x: number, y: number, w: number, h: number, color: RGB) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      engine.pixels[y + dy][x + dx] = { ...color };
    }
  }
}

describe('floodFill', () => {
  it('fills a solid region of one color', () => {
    const engine = createMockEngine(10, 10, { r: 0, g: 0, b: 0 });
    const fillColor: RGB = { r: 255, g: 0, b: 0 };

    const result = floodFill(engine, 5, 5, fillColor);

    expect(result.pixelCount).toBe(100); // entire 10x10 grid
    // Verify all pixels are now red
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        expect(engine.pixels[y][x]).toEqual(fillColor);
      }
    }
  });

  it('returns zero when fill color matches target', () => {
    const engine = createMockEngine(10, 10, { r: 100, g: 100, b: 100 });
    const result = floodFill(engine, 0, 0, { r: 100, g: 100, b: 100 });
    expect(result.pixelCount).toBe(0);
  });

  it('does not cross color boundaries', () => {
    const engine = createMockEngine(10, 10, { r: 0, g: 0, b: 0 });
    const border: RGB = { r: 50, g: 50, b: 50 };
    const fill: RGB = { r: 255, g: 0, b: 0 };

    // Create a vertical border at x=5
    for (let y = 0; y < 10; y++) {
      engine.pixels[y][5] = { ...border };
    }

    // Fill left side only
    const result = floodFill(engine, 2, 2, fill);
    expect(result.pixelCount).toBe(50); // 5 columns * 10 rows

    // Right side should still be black
    expect(engine.pixels[0][6]).toEqual({ r: 0, g: 0, b: 0 });
    expect(engine.pixels[5][8]).toEqual({ r: 0, g: 0, b: 0 });

    // Border should be untouched
    expect(engine.pixels[0][5]).toEqual(border);
  });

  it('fills an enclosed region', () => {
    const engine = createMockEngine(10, 10, { r: 0, g: 0, b: 0 });
    const wall: RGB = { r: 100, g: 100, b: 100 };
    const fill: RGB = { r: 0, g: 255, b: 0 };

    // Create a 3x3 box of walls with a 1x1 interior at (4,4)
    // Wall at x=3..5, y=3 (top)
    // Wall at x=3, y=4 (left) and x=5, y=4 (right)
    // Wall at x=3..5, y=5 (bottom)
    for (let x = 3; x <= 5; x++) {
      engine.pixels[3][x] = { ...wall };
      engine.pixels[5][x] = { ...wall };
    }
    engine.pixels[4][3] = { ...wall };
    engine.pixels[4][5] = { ...wall };

    // Fill inside the box
    const result = floodFill(engine, 4, 4, fill);
    expect(result.pixelCount).toBe(1);
    expect(engine.pixels[4][4]).toEqual(fill);

    // Outside should still be black
    expect(engine.pixels[0][0]).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('handles out-of-bounds start coordinates', () => {
    const engine = createMockEngine(10, 10);
    const result = floodFill(engine, -1, -1, { r: 255, g: 0, b: 0 });
    expect(result.pixelCount).toBe(0);

    const result2 = floodFill(engine, 100, 100, { r: 255, g: 0, b: 0 });
    expect(result2.pixelCount).toBe(0);
  });

  it('tracks affected tiles', () => {
    const engine = createMockEngine(10, 10, { r: 0, g: 0, b: 0 });
    const result = floodFill(engine, 0, 0, { r: 255, g: 0, b: 0 });
    expect(result.affectedTiles.size).toBeGreaterThan(0);
  });

  it('respects borders — refuses to fill non-empty target', () => {
    const engine = createMockEngine(10, 10, { r: 50, g: 50, b: 50 }); // non-empty
    const result = floodFill(engine, 5, 5, { r: 255, g: 0, b: 0 }, {
      respectBorders: true,
    });
    expect(result.pixelCount).toBe(0);
  });

  it('respects borders — fills empty (black) target', () => {
    const engine = createMockEngine(10, 10, { r: 0, g: 0, b: 0 }); // empty
    const result = floodFill(engine, 5, 5, { r: 255, g: 0, b: 0 }, {
      respectBorders: true,
    });
    expect(result.pixelCount).toBe(100);
  });

  it('respects custom isEmptyColor', () => {
    const emptyColor: RGB = { r: 128, g: 128, b: 128 };
    const engine = createMockEngine(10, 10, emptyColor);

    const result = floodFill(engine, 5, 5, { r: 255, g: 0, b: 0 }, {
      respectBorders: true,
      isEmptyColor: (c: RGB) => c.r === 128 && c.g === 128 && c.b === 128,
    });
    expect(result.pixelCount).toBe(100);
  });

  it('province lock — only fills matching target color', () => {
    const engine = createMockEngine(10, 10, { r: 0, g: 0, b: 0 });
    const province: RGB = { r: 200, g: 100, b: 50 };

    // Paint a small region with the province color
    setRect(engine, 2, 2, 3, 3, province);

    // Try to fill starting from the province area, with lock requiring province color
    const result = floodFill(engine, 3, 3, { r: 255, g: 0, b: 0 }, {
      isTargetColor: (c: RGB) => c.r === 200 && c.g === 100 && c.b === 50,
    });
    // The fill starts at a pixel matching province color, and only fills connected province pixels
    expect(result.pixelCount).toBe(9); // 3x3 region
  });

  it('province lock — refuses if start pixel does not match', () => {
    const engine = createMockEngine(10, 10, { r: 0, g: 0, b: 0 });

    const result = floodFill(engine, 5, 5, { r: 255, g: 0, b: 0 }, {
      isTargetColor: (c: RGB) => c.r === 200 && c.g === 100 && c.b === 50,
    });
    expect(result.pixelCount).toBe(0);
  });

  it('calls onNewTile callback for each affected tile', () => {
    const engine = createMockEngine(10, 10, { r: 0, g: 0, b: 0 });
    const onNewTile = vi.fn();

    floodFill(engine, 0, 0, { r: 255, g: 0, b: 0 }, { onNewTile });
    expect(onNewTile).toHaveBeenCalled();
  });

  it('fills an L-shaped region', () => {
    const engine = createMockEngine(10, 10, { r: 0, g: 0, b: 0 });
    const wall: RGB = { r: 100, g: 100, b: 100 };
    const fill: RGB = { r: 0, g: 0, b: 255 };

    // Create walls to form an L shape of empty space:
    // Empty: rows 0-4 columns 0-4 (5x5 = 25 pixels)
    // Plus:  rows 5-9 columns 0-2 (5x3 = 15 pixels)
    // Total: 40 pixels

    // Vertical wall at column 5 for rows 0-4
    for (let y = 0; y <= 4; y++) engine.pixels[y][5] = { ...wall };
    // Horizontal wall at row 5 for columns 3-9
    for (let x = 3; x <= 9; x++) engine.pixels[5][x] = { ...wall };
    // Vertical wall at column 3 for rows 5-9
    for (let y = 5; y <= 9; y++) engine.pixels[y][3] = { ...wall };

    const result = floodFill(engine, 2, 2, fill);
    // Left top block: 5 cols * 5 rows = 25
    // Left bottom block: 3 cols * 5 rows = 15
    expect(result.pixelCount).toBe(40);
  });
});
