/** RGB color as 0-255 integers */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Convert RGB to a hex string key for use in Maps/Sets */
export function rgbToKey(color: RGB): string {
  return `${color.r},${color.g},${color.b}`;
}

/** Parse an RGB key back to an RGB object */
export function keyToRgb(key: string): RGB {
  const [r, g, b] = key.split(',').map(Number);
  return { r, g, b };
}

/** A date-stamped override entry in a province history block */
export interface ProvinceDateEntry {
  /** Date string, e.g. "7824.1.1" */
  date: string;
  /** Key-value overrides at this date (culture, religion, holding, etc.) */
  overrides: Record<string, string>;
  /** Raw nested blocks preserved for non-destructive write (e.g. buildings) */
  rawBlocks?: Record<string, string>;
}

/** Province data as stored in definition.csv and enriched by history files */
export interface ProvinceData {
  /** Province ID (numeric, from definition.csv) */
  id: number;
  /** RGB color assigned to this province */
  color: RGB;
  /** Province display name */
  name: string;
  /** Title tier: b=barony, c=county, d=duchy, k=kingdom, e=empire */
  titleTier?: 'b' | 'c' | 'd' | 'k' | 'e';
  /** Title key, e.g. "c_example" */
  titleKey?: string;
  /** Culture ID (base, before any date overrides) */
  culture?: string;
  /** Religion ID (base, before any date overrides) */
  religion?: string;
  /** Holding type (base) */
  holding?: string;
  /** Terrain type */
  terrain?: string;
  /** Date-stamped history entries with overrides */
  dateEntries?: ProvinceDateEntry[];
  /** Which history file this province was loaded from */
  historyFile?: string;
  /** Whether this province was created in the current session (needs file stubs) */
  isNew?: boolean;
}

/** Tile coordinate (which tile in the grid) */
export interface TileCoord {
  /** Tile column (0 to TILES_X-1) */
  tx: number;
  /** Tile row (0 to TILES_Y-1) */
  ty: number;
}

/** Global pixel coordinate */
export interface GlobalCoord {
  /** X position in the full map (0 to MAP_WIDTH-1) */
  gx: number;
  /** Y position in the full map (0 to MAP_HEIGHT-1) */
  gy: number;
}

/** Viewport rectangle in global coordinates */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Camera state for pan/zoom */
export interface CameraState {
  /** X offset (pan) in global pixels */
  offsetX: number;
  /** Y offset (pan) in global pixels */
  offsetY: number;
  /** Zoom level (1.0 = 100%) */
  zoom: number;
}

/** Paint tool types */
export type ToolType = 'flood-fill' | 'brush' | 'eraser' | 'border-paint';

/** Mod directory structure after loading */
export interface ModData {
  /** Absolute path to mod root directory */
  rootPath: string;
  /** All provinces from definition.csv */
  provinces: ProvinceData[];
  /** Landed title tree (simplified) */
  landedTitles: LandedTitleNode[];
  /** Whether any data has been modified since last save */
  isDirty: boolean;
}

/** Recursive landed title tree node */
export interface LandedTitleNode {
  /** Title key, e.g. "e_britannia", "k_england", "c_london" */
  key: string;
  /** Title tier inferred from prefix */
  tier: 'b' | 'c' | 'd' | 'k' | 'e';
  /** Color if specified */
  color?: RGB;
  /** Province ID if this is a barony */
  provinceId?: number;
  /** Child titles */
  children: LandedTitleNode[];
}

/** Result of loading a mod directory */
export interface LoadModResult {
  success: boolean;
  data?: ModData;
  error?: string;
}

/** Data sent when creating a new province */
export interface CreateProvinceRequest {
  name: string;
  color: RGB;
  titleTier: 'b' | 'c';
  /** Existing county key to add the barony under */
  parentTitle?: string;
  /** If true, parentTitle is a NEW county key to create (not an existing one) */
  createCounty?: boolean;
  /** When creating a new county, optionally nest it under this duchy */
  parentDuchy?: string;
  culture?: string;
  religion?: string;
  holding?: string;
  terrain?: string;
  /** Existing history file to append the province entry to (e.g. "lv_k_north_valyria.txt") */
  historyFile?: string;
}

/** Undo/redo action */
export interface UndoAction {
  /** Which tiles were affected */
  tileIndices: number[];
  /** Snapshot of tile data BEFORE the action (for undo) */
  beforeSnapshots: Map<number, Uint8ClampedArray>;
  /** Snapshot of tile data AFTER the action (for redo) */
  afterSnapshots: Map<number, Uint8ClampedArray>;
  /** Description for UI */
  description: string;
}
