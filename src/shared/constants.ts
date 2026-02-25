/** Tile size in pixels — 512 is well within GPU texture limits */
export const TILE_SIZE = 512;

/** Bytes per pixel (RGBA) */
export const BYTES_PER_PIXEL = 4;

/** Tile buffer size in bytes */
export const TILE_BUFFER_SIZE = TILE_SIZE * TILE_SIZE * BYTES_PER_PIXEL;

/** 
 * The "empty" province color — pixels with this color are unassigned.
 * CK3 uses (0, 0, 0) as the ocean/unassigned default.
 */
export const EMPTY_COLOR = { r: 0, g: 0, b: 0 };

/** Zoom limits */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 32;

/** IPC channel names */
export const IPC = {
  LOAD_IMAGE: 'load-image',
  SAVE_IMAGE: 'save-image',
  LOAD_MOD: 'load-mod',
  SAVE_MOD: 'save-mod',
  CREATE_PROVINCE: 'create-province',
  SELECT_DIRECTORY: 'select-directory',
} as const;
