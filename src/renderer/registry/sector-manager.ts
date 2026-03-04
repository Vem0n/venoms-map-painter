/**
 * SectorManager — Spatial index that tracks which province colors exist in each
 * 64×64 pixel sector of the map.
 *
 * Sectors are NOT physical divisions — no pixel buffers are allocated. This is a
 * pure hashmap index: each sector records which RGB color keys are present within
 * its 64×64 pixel region, and a reverse index tracks which sectors contain each color.
 *
 * Sectors align perfectly with tiles (512 / 64 = 8 sectors per tile edge), so a
 * sector never spans tile boundaries. Sectors are globally addressable by 2D
 * coordinates (globalSectorX, globalSectorY), packed into a single integer key.
 */

import { TILE_SIZE, BYTES_PER_PIXEL, SECTOR_SIZE, SECTORS_PER_TILE } from '@shared/constants';

/**
 * Callback to read a tile's raw RGBA pixel buffer by index.
 * Abstracts TileEngine access so SectorManager has no direct dependency.
 */
export type TileBufferReader = (tileIndex: number) => Uint8ClampedArray | null;

/** Empty readonly set returned for missing lookups (avoids allocations) */
const EMPTY_SET: ReadonlySet<string> & ReadonlySet<number> = Object.freeze(new Set<never>());

export class SectorManager {
  /** For each sector, which RGB color keys are present */
  private sectorToColors = new Map<number, Set<string>>();

  /** For each color, which sectors contain it (reverse index) */
  private colorToSectors = new Map<string, Set<number>>();

  /** Map and grid dimensions */
  private totalSectorsX = 0;
  private totalSectorsY = 0;
  private mapWidth = 0;
  private mapHeight = 0;
  private tilesX = 0;

  /** Callback to read tile buffer data from TileEngine */
  private readTileBuffer: TileBufferReader | null = null;

  /** Whether populateAsync has completed */
  private _populated = false;

  /**
   * Initialize for a given map size and provide the tile buffer reader.
   * Clears all previous data. Call populateAsync() afterwards to scan.
   */
  init(
    mapWidth: number,
    mapHeight: number,
    tilesX: number,
    tilesY: number,
    readTileBuffer: TileBufferReader,
  ): void {
    this.clear();
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.tilesX = tilesX;
    this.totalSectorsX = Math.ceil(mapWidth / SECTOR_SIZE);
    this.totalSectorsY = Math.ceil(mapHeight / SECTOR_SIZE);
    this.readTileBuffer = readTileBuffer;
    // tilesY is accepted for symmetry but not stored — derivable from totalSectorsY
    void tilesY;
  }

  /**
   * Full initial population by scanning every tile buffer.
   * Async/chunked: processes 4 tiles per frame to avoid UI freeze.
   */
  populateAsync(onProgress?: (scanned: number, total: number) => void): Promise<void> {
    const totalTiles = this.tilesX * Math.ceil(this.totalSectorsY / SECTORS_PER_TILE);
    const tilesY = Math.ceil(this.totalSectorsY / SECTORS_PER_TILE);
    const TILES_PER_CHUNK = 4;
    let tileIdx = 0;
    let sectorsScanned = 0;
    const total = this.totalSectorsX * this.totalSectorsY;

    return new Promise((resolve) => {
      const processChunk = (): void => {
        const end = Math.min(tileIdx + TILES_PER_CHUNK, totalTiles);

        for (; tileIdx < end; tileIdx++) {
          const tx = tileIdx % this.tilesX;
          const ty = Math.floor(tileIdx / this.tilesX);
          if (ty >= tilesY) continue;

          for (let sy = 0; sy < SECTORS_PER_TILE; sy++) {
            for (let sx = 0; sx < SECTORS_PER_TILE; sx++) {
              const gsx = tx * SECTORS_PER_TILE + sx;
              const gsy = ty * SECTORS_PER_TILE + sy;
              if (gsx >= this.totalSectorsX || gsy >= this.totalSectorsY) continue;

              const sectorKey = gsy * this.totalSectorsX + gsx;
              this.scanSector(sectorKey);
              sectorsScanned++;
            }
          }
        }

        onProgress?.(sectorsScanned, total);

        if (tileIdx < totalTiles) {
          setTimeout(processChunk, 0);
        } else {
          this._populated = true;
          resolve();
        }
      };

      processChunk();
    });
  }

  /**
   * Rescan specific sectors by their global sector keys.
   * Reads each sector's 64×64 pixel region from the tile buffer and rebuilds
   * its color set.
   */
  rescanSectors(sectorKeys: Iterable<number>): void {
    for (const key of sectorKeys) {
      this.scanSector(key);
    }
  }

  /**
   * Rescan sectors affected by pixel-coordinate changes.
   * Deduplicates sector keys before rescanning.
   */
  rescanByPixels(pixels: Array<{ gx: number; gy: number }>): void {
    const affected = new Set<number>();
    for (const { gx, gy } of pixels) {
      if (gx < 0 || gx >= this.mapWidth || gy < 0 || gy >= this.mapHeight) continue;
      affected.add(SectorManager.sectorKeyFromPixel(gx, gy, this.totalSectorsX));
    }
    this.rescanSectors(affected);
  }

  /**
   * Rescan sectors affected by a rectangular bounding box of global pixel coords.
   * More efficient than rescanByPixels for large contiguous areas.
   */
  rescanByBounds(minGx: number, minGy: number, maxGx: number, maxGy: number): void {
    const startSx = Math.max(0, Math.floor(minGx / SECTOR_SIZE));
    const startSy = Math.max(0, Math.floor(minGy / SECTOR_SIZE));
    const endSx = Math.min(this.totalSectorsX - 1, Math.floor(maxGx / SECTOR_SIZE));
    const endSy = Math.min(this.totalSectorsY - 1, Math.floor(maxGy / SECTOR_SIZE));

    const affected: number[] = [];
    for (let sy = startSy; sy <= endSy; sy++) {
      for (let sx = startSx; sx <= endSx; sx++) {
        affected.push(sy * this.totalSectorsX + sx);
      }
    }
    this.rescanSectors(affected);
  }

  /**
   * Rescan all sectors that contain (or contained) a specific color.
   * Useful after undo/redo or color replacement.
   */
  rescanByColor(colorKey: string): void {
    const sectors = this.colorToSectors.get(colorKey);
    if (!sectors || sectors.size === 0) return;
    // Snapshot the set — scanSector mutates colorToSectors
    this.rescanSectors([...sectors]);
  }

  /**
   * Rescan all sectors within specific tiles (by tile index).
   * Each tile contains 8×8 = 64 sectors.
   */
  rescanByTiles(tileIndices: Iterable<number>): void {
    const affected: number[] = [];
    for (const tileIndex of tileIndices) {
      const tx = tileIndex % this.tilesX;
      const ty = Math.floor(tileIndex / this.tilesX);
      const baseSx = tx * SECTORS_PER_TILE;
      const baseSy = ty * SECTORS_PER_TILE;

      for (let sy = 0; sy < SECTORS_PER_TILE; sy++) {
        for (let sx = 0; sx < SECTORS_PER_TILE; sx++) {
          const gsx = baseSx + sx;
          const gsy = baseSy + sy;
          if (gsx >= this.totalSectorsX || gsy >= this.totalSectorsY) continue;
          affected.push(gsy * this.totalSectorsX + gsx);
        }
      }
    }
    this.rescanSectors(affected);
  }

  /** Query: which sectors contain this color? */
  getSectorsForColor(colorKey: string): ReadonlySet<number> {
    return this.colorToSectors.get(colorKey) ?? EMPTY_SET;
  }

  /** Query: which colors are present in this sector? */
  getColorsInSector(sectorKey: number): ReadonlySet<string> {
    return this.sectorToColors.get(sectorKey) ?? EMPTY_SET;
  }

  /**
   * Query: which tile indices contain any of the given colors?
   * Aggregates sector lookups across all color keys and derives
   * unique tile indices. Much faster than scanning all tiles.
   */
  getTilesForColors(colorKeys: Iterable<string>): Set<number> {
    const tiles = new Set<number>();
    for (const key of colorKeys) {
      const sectors = this.colorToSectors.get(key);
      if (!sectors) continue;
      for (const sectorKey of sectors) {
        const { tileIndex } = SectorManager.tileInfoForSector(sectorKey, this.totalSectorsX, this.tilesX);
        tiles.add(tileIndex);
      }
    }
    return tiles;
  }

  /**
   * Remap a color key in both maps when a province color changes.
   * Called from ColorRegistry.updateProvinceColor().
   */
  remapColor(oldKey: string, newKey: string): void {
    const sectors = this.colorToSectors.get(oldKey);
    if (!sectors) return;

    // Move the sector set from old key to new key
    this.colorToSectors.delete(oldKey);

    // Merge into existing set for newKey if it somehow exists
    const existing = this.colorToSectors.get(newKey);
    if (existing) {
      for (const s of sectors) existing.add(s);
      this.colorToSectors.set(newKey, existing);
    } else {
      this.colorToSectors.set(newKey, sectors);
    }

    // Update forward map: replace oldKey with newKey in each sector's color set
    for (const sectorKey of sectors) {
      const colors = this.sectorToColors.get(sectorKey);
      if (colors) {
        colors.delete(oldKey);
        colors.add(newKey);
      }
    }
  }

  /**
   * Remove a color from all sector maps.
   * Called from ColorRegistry.removeProvince().
   */
  removeColor(colorKey: string): void {
    const sectors = this.colorToSectors.get(colorKey);
    if (!sectors) return;

    // Remove from forward map
    for (const sectorKey of sectors) {
      const colors = this.sectorToColors.get(sectorKey);
      if (colors) {
        colors.delete(colorKey);
        if (colors.size === 0) this.sectorToColors.delete(sectorKey);
      }
    }

    // Remove from reverse map
    this.colorToSectors.delete(colorKey);
  }

  /** Clear all sector data. */
  clear(): void {
    this.sectorToColors.clear();
    this.colorToSectors.clear();
    this.totalSectorsX = 0;
    this.totalSectorsY = 0;
    this.mapWidth = 0;
    this.mapHeight = 0;
    this.tilesX = 0;
    this.readTileBuffer = null;
    this._populated = false;
  }

  /** Whether sectors have been populated. */
  get isPopulated(): boolean {
    return this._populated;
  }

  /** Total number of sectors in the grid. */
  get totalSectors(): number {
    return this.totalSectorsX * this.totalSectorsY;
  }

  /** Get grid dimensions for external callers. */
  get gridSize(): { sectorsX: number; sectorsY: number } {
    return { sectorsX: this.totalSectorsX, sectorsY: this.totalSectorsY };
  }

  /** Number of unique colors tracked in the reverse index. */
  get colorCount(): number {
    return this.colorToSectors.size;
  }

  /* ── Static helpers ── */

  /** Compute global sector key from pixel coordinates. */
  static sectorKeyFromPixel(gx: number, gy: number, totalSectorsX: number): number {
    const gsx = Math.floor(gx / SECTOR_SIZE);
    const gsy = Math.floor(gy / SECTOR_SIZE);
    return gsy * totalSectorsX + gsx;
  }

  /** Compute global sector coords from sector key. */
  static sectorCoordsFromKey(key: number, totalSectorsX: number): { gsx: number; gsy: number } {
    return {
      gsx: key % totalSectorsX,
      gsy: Math.floor(key / totalSectorsX),
    };
  }

  /** Compute the tile index and local pixel origin for a given global sector key. */
  static tileInfoForSector(
    sectorKey: number,
    totalSectorsX: number,
    tilesX: number,
  ): { tileIndex: number; localOriginX: number; localOriginY: number } {
    const gsx = sectorKey % totalSectorsX;
    const gsy = Math.floor(sectorKey / totalSectorsX);
    const tx = Math.floor(gsx / SECTORS_PER_TILE);
    const ty = Math.floor(gsy / SECTORS_PER_TILE);
    return {
      tileIndex: ty * tilesX + tx,
      localOriginX: (gsx % SECTORS_PER_TILE) * SECTOR_SIZE,
      localOriginY: (gsy % SECTORS_PER_TILE) * SECTOR_SIZE,
    };
  }

  /* ── Private ── */

  /**
   * Scan a single 64×64 sector region from a tile buffer and rebuild its color set.
   * This is the core scanning primitive — all rescan methods ultimately call this.
   */
  private scanSector(sectorKey: number): void {
    const { tileIndex, localOriginX, localOriginY } =
      SectorManager.tileInfoForSector(sectorKey, this.totalSectorsX, this.tilesX);

    const buf = this.readTileBuffer?.(tileIndex);
    if (!buf) return;

    // Remove old associations from reverse index
    const oldColors = this.sectorToColors.get(sectorKey);
    if (oldColors) {
      for (const colorKey of oldColors) {
        const sectors = this.colorToSectors.get(colorKey);
        if (sectors) {
          sectors.delete(sectorKey);
          if (sectors.size === 0) this.colorToSectors.delete(colorKey);
        }
      }
    }

    // Compute valid pixel range for edge sectors
    const gsx = sectorKey % this.totalSectorsX;
    const gsy = Math.floor(sectorKey / this.totalSectorsX);
    const sectorGlobalX = gsx * SECTOR_SIZE;
    const sectorGlobalY = gsy * SECTOR_SIZE;
    const validW = Math.min(SECTOR_SIZE, this.mapWidth - sectorGlobalX);
    const validH = Math.min(SECTOR_SIZE, this.mapHeight - sectorGlobalY);

    // Scan the 64×64 region
    const newColors = new Set<string>();
    const rowStride = TILE_SIZE * BYTES_PER_PIXEL;

    for (let ly = 0; ly < validH; ly++) {
      const rowBase = (localOriginY + ly) * rowStride + localOriginX * BYTES_PER_PIXEL;
      for (let lx = 0; lx < validW; lx++) {
        const off = rowBase + lx * BYTES_PER_PIXEL;
        const key = `${buf[off]},${buf[off + 1]},${buf[off + 2]}`;
        newColors.add(key);
      }
    }

    // Update forward map
    this.sectorToColors.set(sectorKey, newColors);

    // Update reverse map
    for (const colorKey of newColors) {
      let sectors = this.colorToSectors.get(colorKey);
      if (!sectors) {
        sectors = new Set();
        this.colorToSectors.set(colorKey, sectors);
      }
      sectors.add(sectorKey);
    }
  }
}
