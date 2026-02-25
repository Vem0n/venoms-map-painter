/**
 * Tile — Data structure for a single 512×512 tile.
 */

import { TILE_SIZE, BYTES_PER_PIXEL } from '@shared/constants';

export interface Tile {
  /** Tile grid position */
  tx: number;
  ty: number;
  /** Tile index in the flat array (ty * TILES_X + tx) */
  index: number;
  /** CPU-side pixel data (RGBA) */
  buffer: Uint8ClampedArray;
  /** GPU texture handle */
  texture: WebGLTexture | null;
  /** Whether this tile has been modified since last save */
  dirty: boolean;
  /** Whether the GPU texture needs re-uploading */
  gpuDirty: boolean;
}

export function createTile(tx: number, ty: number, index: number): Tile {
  return {
    tx,
    ty,
    index,
    buffer: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * BYTES_PER_PIXEL),
    texture: null,
    dirty: false,
    gpuDirty: false,
  };
}
