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

/** Sector size in pixels for spatial indexing (subdivides tiles into 8×8 grid) */
export const SECTOR_SIZE = 64;

/** Number of sectors per tile edge */
export const SECTORS_PER_TILE = TILE_SIZE / SECTOR_SIZE; // = 8

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
  RECONCILE_PROVINCES: 'reconcile-provinces',
  SAVE_DRAFT: 'save-draft',
  LIST_DRAFTS: 'list-drafts',
  LOAD_DRAFT_IMAGE: 'load-draft-image',
  LOAD_DRAFT_METADATA: 'load-draft-metadata',
  DELETE_DRAFT: 'delete-draft',
  LOAD_HEIGHTMAP: 'load-heightmap',
} as const;
