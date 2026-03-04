import { describe, it, expect, beforeEach } from 'vitest';
import { SectorManager } from '@registry/sector-manager';
import { TILE_SIZE, BYTES_PER_PIXEL, SECTOR_SIZE, SECTORS_PER_TILE } from '@shared/constants';
import { rgbToKey } from '@shared/types';

/** Create a 512×512 tile buffer filled with a single color. */
function makeTileBuffer(r: number, g: number, b: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * BYTES_PER_PIXEL);
  for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

/**
 * Paint a specific 64×64 sector region within a tile buffer with a color.
 * sectorLocalX/Y are 0-7 within the tile.
 */
function paintSectorInBuffer(
  buf: Uint8ClampedArray,
  sectorLocalX: number,
  sectorLocalY: number,
  r: number,
  g: number,
  b: number,
): void {
  const originX = sectorLocalX * SECTOR_SIZE;
  const originY = sectorLocalY * SECTOR_SIZE;
  for (let ly = 0; ly < SECTOR_SIZE; ly++) {
    for (let lx = 0; lx < SECTOR_SIZE; lx++) {
      const off = ((originY + ly) * TILE_SIZE + (originX + lx)) * BYTES_PER_PIXEL;
      buf[off] = r;
      buf[off + 1] = g;
      buf[off + 2] = b;
      buf[off + 3] = 255;
    }
  }
}

/** Paint a single pixel in a tile buffer at local coords. */
function paintPixelInBuffer(
  buf: Uint8ClampedArray,
  lx: number,
  ly: number,
  r: number,
  g: number,
  b: number,
): void {
  const off = (ly * TILE_SIZE + lx) * BYTES_PER_PIXEL;
  buf[off] = r;
  buf[off + 1] = g;
  buf[off + 2] = b;
  buf[off + 3] = 255;
}

describe('SectorManager', () => {
  describe('static helpers', () => {
    // For a 512×512 map: totalSectorsX = 8
    const totalSectorsX = 8;

    it('sectorKeyFromPixel returns 0 for pixel (0,0)', () => {
      expect(SectorManager.sectorKeyFromPixel(0, 0, totalSectorsX)).toBe(0);
    });

    it('sectorKeyFromPixel returns 0 for pixel (63,63) — still in sector (0,0)', () => {
      expect(SectorManager.sectorKeyFromPixel(63, 63, totalSectorsX)).toBe(0);
    });

    it('sectorKeyFromPixel returns 1 for pixel (64,0) — sector (1,0)', () => {
      expect(SectorManager.sectorKeyFromPixel(64, 0, totalSectorsX)).toBe(1);
    });

    it('sectorKeyFromPixel returns totalSectorsX for pixel (0,64) — sector (0,1)', () => {
      expect(SectorManager.sectorKeyFromPixel(0, 64, totalSectorsX)).toBe(totalSectorsX);
    });

    it('sectorCoordsFromKey round-trips with sectorKeyFromPixel', () => {
      const key = SectorManager.sectorKeyFromPixel(200, 150, totalSectorsX);
      const { gsx, gsy } = SectorManager.sectorCoordsFromKey(key, totalSectorsX);
      expect(gsx).toBe(Math.floor(200 / SECTOR_SIZE)); // 3
      expect(gsy).toBe(Math.floor(150 / SECTOR_SIZE)); // 2
    });

    it('tileInfoForSector returns correct tile and local origin', () => {
      // For a 1024×512 map: tilesX=2, totalSectorsX=16
      // Sector (9, 0) = global sector key 9, should be in tile 1, localOriginX=64
      const tsX = 16;
      const tilesX = 2;
      const key = 9; // gsx=9, gsy=0
      const info = SectorManager.tileInfoForSector(key, tsX, tilesX);
      expect(info.tileIndex).toBe(1); // tx=1, ty=0
      expect(info.localOriginX).toBe(SECTOR_SIZE); // (9 % 8) * 64 = 64
      expect(info.localOriginY).toBe(0);
    });

    it('tileInfoForSector handles second tile row', () => {
      // For a 512×1024 map: tilesX=1, totalSectorsX=8, tilesY=2
      // Sector at gsy=8 (second tile row), gsx=0
      const tsX = 8;
      const tilesX = 1;
      const key = 8 * tsX + 0; // gsy=8, gsx=0
      const info = SectorManager.tileInfoForSector(key, tsX, tilesX);
      expect(info.tileIndex).toBe(1); // ty=1, tx=0
      expect(info.localOriginX).toBe(0);
      expect(info.localOriginY).toBe(0);
    });
  });

  describe('init and clear', () => {
    let sm: SectorManager;

    beforeEach(() => {
      sm = new SectorManager();
    });

    it('init sets correct dimensions', () => {
      const buf = makeTileBuffer(0, 0, 0);
      sm.init(512, 512, 1, 1, () => buf);
      expect(sm.totalSectors).toBe(64); // 8 * 8
      expect(sm.gridSize).toEqual({ sectorsX: 8, sectorsY: 8 });
    });

    it('clear resets all data', () => {
      const buf = makeTileBuffer(100, 50, 25);
      sm.init(512, 512, 1, 1, () => buf);
      sm.clear();
      expect(sm.totalSectors).toBe(0);
      expect(sm.isPopulated).toBe(false);
    });

    it('isPopulated is false before populateAsync', () => {
      const buf = makeTileBuffer(0, 0, 0);
      sm.init(512, 512, 1, 1, () => buf);
      expect(sm.isPopulated).toBe(false);
    });
  });

  describe('populateAsync', () => {
    let sm: SectorManager;

    beforeEach(() => {
      sm = new SectorManager();
    });

    it('populates all sectors and sets isPopulated', async () => {
      const buf = makeTileBuffer(10, 20, 30);
      sm.init(512, 512, 1, 1, () => buf);
      await sm.populateAsync();
      expect(sm.isPopulated).toBe(true);
    });

    it('single-color tile reports that color in all 64 sectors', async () => {
      const buf = makeTileBuffer(10, 20, 30);
      const colorKey = rgbToKey({ r: 10, g: 20, b: 30 });
      sm.init(512, 512, 1, 1, () => buf);
      await sm.populateAsync();

      const sectors = sm.getSectorsForColor(colorKey);
      expect(sectors.size).toBe(64);
    });

    it('multi-color tile reports colors only in their sectors', async () => {
      const buf = makeTileBuffer(0, 0, 0);
      // Paint sector (2, 3) with a specific color
      paintSectorInBuffer(buf, 2, 3, 100, 150, 200);
      const paintedKey = rgbToKey({ r: 100, g: 150, b: 200 });

      sm.init(512, 512, 1, 1, () => buf);
      await sm.populateAsync();

      const sectors = sm.getSectorsForColor(paintedKey);
      expect(sectors.size).toBe(1);
      // sector (2,3) key = 3 * 8 + 2 = 26
      expect(sectors.has(26)).toBe(true);
    });

    it('reverse index is correct', async () => {
      const buf = makeTileBuffer(0, 0, 0);
      paintSectorInBuffer(buf, 0, 0, 50, 60, 70);
      const bgKey = rgbToKey({ r: 0, g: 0, b: 0 });
      const fgKey = rgbToKey({ r: 50, g: 60, b: 70 });

      sm.init(512, 512, 1, 1, () => buf);
      await sm.populateAsync();

      // Sector (0,0) should contain both bg and fg... wait, we painted the entire sector
      // Actually, paintSectorInBuffer overwrites the whole sector, so sector 0 has only fg
      const colorsInSector0 = sm.getColorsInSector(0);
      expect(colorsInSector0.has(fgKey)).toBe(true);
      expect(colorsInSector0.has(bgKey)).toBe(false);

      // Other sectors should have only bg
      const colorsInSector1 = sm.getColorsInSector(1);
      expect(colorsInSector1.has(bgKey)).toBe(true);
      expect(colorsInSector1.has(fgKey)).toBe(false);
    });

    it('handles edge tiles for non-aligned map sizes', async () => {
      // 600×600 map: 2×2 tiles, totalSectorsX = ceil(600/64) = 10, totalSectorsY = 10
      const tile0 = makeTileBuffer(10, 10, 10); // tile (0,0)
      const tile1 = makeTileBuffer(20, 20, 20); // tile (1,0)
      const tile2 = makeTileBuffer(30, 30, 30); // tile (0,1)
      const tile3 = makeTileBuffer(40, 40, 40); // tile (1,1)
      const tiles = [tile0, tile1, tile2, tile3];

      sm.init(600, 600, 2, 2, (idx) => tiles[idx] ?? null);
      await sm.populateAsync();

      expect(sm.totalSectors).toBe(100); // 10 * 10
      expect(sm.isPopulated).toBe(true);

      // Sector at (9, 0) — the edge sector at x=576..599 (only 24px wide, in tile 1)
      const edgeKey = 0 * 10 + 9;
      const colors = sm.getColorsInSector(edgeKey);
      expect(colors.has(rgbToKey({ r: 20, g: 20, b: 20 }))).toBe(true);
    });

    it('progress callback fires with correct counts', async () => {
      const buf = makeTileBuffer(0, 0, 0);
      sm.init(512, 512, 1, 1, () => buf);
      const progressCalls: [number, number][] = [];
      await sm.populateAsync((scanned, total) => {
        progressCalls.push([scanned, total]);
      });
      // At least one progress call, last one should have scanned === total
      expect(progressCalls.length).toBeGreaterThan(0);
      const last = progressCalls[progressCalls.length - 1];
      expect(last[0]).toBe(64);
      expect(last[1]).toBe(64);
    });
  });

  describe('rescan', () => {
    let sm: SectorManager;
    let buf: Uint8ClampedArray;

    beforeEach(async () => {
      sm = new SectorManager();
      buf = makeTileBuffer(0, 0, 0);
      sm.init(512, 512, 1, 1, () => buf);
      await sm.populateAsync();
    });

    it('rescanSectors detects new color after buffer mutation', () => {
      const newKey = rgbToKey({ r: 200, g: 100, b: 50 });
      expect(sm.getSectorsForColor(newKey).size).toBe(0);

      // Paint a pixel in sector (1, 0)
      paintPixelInBuffer(buf, 64 + 5, 10, 200, 100, 50);
      const sectorKey = SectorManager.sectorKeyFromPixel(64 + 5, 10, 8);
      sm.rescanSectors([sectorKey]);

      expect(sm.getSectorsForColor(newKey).size).toBe(1);
      expect(sm.getSectorsForColor(newKey).has(sectorKey)).toBe(true);
    });

    it('rescanSectors removes stale color from reverse index', () => {
      const bgKey = rgbToKey({ r: 0, g: 0, b: 0 });
      // sector 0 initially has black
      expect(sm.getSectorsForColor(bgKey).has(0)).toBe(true);

      // Paint entire sector (0,0) with a new color
      paintSectorInBuffer(buf, 0, 0, 255, 0, 0);
      sm.rescanSectors([0]);

      // Black should no longer be in sector 0
      expect(sm.getColorsInSector(0).has(bgKey)).toBe(false);
      expect(sm.getColorsInSector(0).has(rgbToKey({ r: 255, g: 0, b: 0 }))).toBe(true);
    });

    it('rescanByBounds covers correct sector range', () => {
      // Paint a pixel at (130, 65) — sector (2, 1) = key 1*8+2 = 10
      paintPixelInBuffer(buf, 130, 65, 42, 43, 44);
      const newKey = rgbToKey({ r: 42, g: 43, b: 44 });

      // Rescan bounding box that covers (128, 64) to (191, 127) — exactly sector (2,1)
      sm.rescanByBounds(128, 64, 191, 127);

      expect(sm.getSectorsForColor(newKey).size).toBe(1);
      expect(sm.getSectorsForColor(newKey).has(10)).toBe(true);
    });

    it('rescanByTiles rescans all 64 sectors in the tile', () => {
      // Paint one pixel per sector with unique colors
      paintPixelInBuffer(buf, 0, 0, 1, 1, 1);
      paintPixelInBuffer(buf, 64, 0, 2, 2, 2);
      paintPixelInBuffer(buf, 0, 64, 3, 3, 3);

      sm.rescanByTiles([0]);

      expect(sm.getSectorsForColor(rgbToKey({ r: 1, g: 1, b: 1 })).size).toBe(1);
      expect(sm.getSectorsForColor(rgbToKey({ r: 2, g: 2, b: 2 })).size).toBe(1);
      expect(sm.getSectorsForColor(rgbToKey({ r: 3, g: 3, b: 3 })).size).toBe(1);
    });

    it('rescanByColor rescans all sectors that held the color', () => {
      const bgKey = rgbToKey({ r: 0, g: 0, b: 0 });
      // Black is in all 64 sectors initially
      expect(sm.getSectorsForColor(bgKey).size).toBe(64);

      // Now paint sector (0,0) entirely red
      paintSectorInBuffer(buf, 0, 0, 255, 0, 0);
      // rescanByColor rescans all sectors that had black
      sm.rescanByColor(bgKey);

      // Sector 0 no longer has black (it's all red now)
      expect(sm.getColorsInSector(0).has(bgKey)).toBe(false);
      expect(sm.getColorsInSector(0).has(rgbToKey({ r: 255, g: 0, b: 0 }))).toBe(true);
      // Other sectors still have black
      expect(sm.getSectorsForColor(bgKey).size).toBe(63);
    });

    it('rescanByPixels deduplicates and rescans correct sectors', () => {
      paintPixelInBuffer(buf, 10, 10, 77, 88, 99);
      paintPixelInBuffer(buf, 20, 20, 77, 88, 99);
      // Both pixels are in sector (0,0)

      sm.rescanByPixels([{ gx: 10, gy: 10 }, { gx: 20, gy: 20 }]);

      const key = rgbToKey({ r: 77, g: 88, b: 99 });
      expect(sm.getSectorsForColor(key).has(0)).toBe(true);
    });
  });

  describe('queries', () => {
    let sm: SectorManager;

    beforeEach(async () => {
      sm = new SectorManager();
      const buf = makeTileBuffer(10, 20, 30);
      sm.init(512, 512, 1, 1, () => buf);
      await sm.populateAsync();
    });

    it('getSectorsForColor returns all sectors for a global color', () => {
      const key = rgbToKey({ r: 10, g: 20, b: 30 });
      expect(sm.getSectorsForColor(key).size).toBe(64);
    });

    it('getColorsInSector returns colors for a valid sector', () => {
      const colors = sm.getColorsInSector(0);
      expect(colors.has(rgbToKey({ r: 10, g: 20, b: 30 }))).toBe(true);
    });

    it('returns empty sets for unknown color/sector', () => {
      expect(sm.getSectorsForColor('999,999,999').size).toBe(0);
      expect(sm.getColorsInSector(99999).size).toBe(0);
    });
  });

  describe('color lifecycle', () => {
    let sm: SectorManager;

    beforeEach(async () => {
      sm = new SectorManager();
      const buf = makeTileBuffer(0, 0, 0);
      paintSectorInBuffer(buf, 0, 0, 100, 200, 50);
      sm.init(512, 512, 1, 1, () => buf);
      await sm.populateAsync();
    });

    it('remapColor moves sector associations from old key to new key', () => {
      const oldKey = rgbToKey({ r: 100, g: 200, b: 50 });
      const newKey = rgbToKey({ r: 150, g: 250, b: 75 });

      const sectorsBefore = new Set(sm.getSectorsForColor(oldKey));
      expect(sectorsBefore.size).toBe(1);

      sm.remapColor(oldKey, newKey);

      expect(sm.getSectorsForColor(oldKey).size).toBe(0);
      expect(sm.getSectorsForColor(newKey).size).toBe(1);
      // Check forward map updated too
      expect(sm.getColorsInSector(0).has(newKey)).toBe(true);
      expect(sm.getColorsInSector(0).has(oldKey)).toBe(false);
    });

    it('remapColor with unknown old key is a no-op', () => {
      sm.remapColor('999,999,999', '111,222,333');
      // No crash, no changes
      expect(sm.getSectorsForColor('111,222,333').size).toBe(0);
    });

    it('removeColor removes from both maps', () => {
      const key = rgbToKey({ r: 100, g: 200, b: 50 });
      expect(sm.getSectorsForColor(key).size).toBe(1);

      sm.removeColor(key);

      expect(sm.getSectorsForColor(key).size).toBe(0);
      expect(sm.getColorsInSector(0).has(key)).toBe(false);
    });

    it('removeColor with unknown key is a no-op', () => {
      sm.removeColor('999,999,999');
      // No crash
      expect(sm.getSectorsForColor('999,999,999').size).toBe(0);
    });
  });

  describe('multi-tile maps', () => {
    it('correctly indexes across multiple tiles', async () => {
      const sm = new SectorManager();
      // 1024×512 map: 2 tiles wide, 1 tile tall
      const tile0 = makeTileBuffer(10, 10, 10);
      const tile1 = makeTileBuffer(20, 20, 20);
      const tiles = [tile0, tile1];

      sm.init(1024, 512, 2, 1, (idx) => tiles[idx] ?? null);
      await sm.populateAsync();

      const totalSectorsX = 16; // 1024 / 64
      expect(sm.gridSize.sectorsX).toBe(totalSectorsX);

      // Sector (0,0) is in tile 0 — should have color (10,10,10)
      const key0 = rgbToKey({ r: 10, g: 10, b: 10 });
      expect(sm.getColorsInSector(0).has(key0)).toBe(true);

      // Sector (8,0) is in tile 1 — should have color (20,20,20)
      const key1 = rgbToKey({ r: 20, g: 20, b: 20 });
      const sectorInTile1 = 0 * totalSectorsX + 8; // gsy=0, gsx=8
      expect(sm.getColorsInSector(sectorInTile1).has(key1)).toBe(true);
      expect(sm.getColorsInSector(sectorInTile1).has(key0)).toBe(false);
    });

    it('getSectorsForColor returns sectors across tiles', async () => {
      const sm = new SectorManager();
      // Both tiles have same color in one sector each
      const tile0 = makeTileBuffer(0, 0, 0);
      const tile1 = makeTileBuffer(0, 0, 0);
      paintSectorInBuffer(tile0, 0, 0, 50, 60, 70);
      paintSectorInBuffer(tile1, 0, 0, 50, 60, 70);
      const tiles = [tile0, tile1];

      sm.init(1024, 512, 2, 1, (idx) => tiles[idx] ?? null);
      await sm.populateAsync();

      const key = rgbToKey({ r: 50, g: 60, b: 70 });
      const sectors = sm.getSectorsForColor(key);
      // Sector (0,0) in tile 0 and sector (8,0) in tile 1
      expect(sectors.size).toBe(2);
      expect(sectors.has(0)).toBe(true);
      expect(sectors.has(8)).toBe(true); // gsx=8, gsy=0
    });
  });
});
