/**
 * ColorRegistry — Manages the bidirectional mapping between RGB colors and provinces.
 *
 * Pure data structure with no rendering concerns.
 * Parsed from definition.csv on load, updated live as provinces are created.
 *
 * Key invariant: No two provinces may share the same RGB color.
 */

import { RGB, ProvinceData, rgbToKey } from '@shared/types';

/**
 * Golden ratio conjugate — used for hue stepping to get visually distinct colors.
 * Each successive hue = (prev + 0.618...) mod 1.0
 */
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

export class ColorRegistry {
  /** RGB key → ProvinceData */
  private colorToProvince: Map<string, ProvinceData>;

  /** Province ID → ProvinceData */
  private idToProvince: Map<number, ProvinceData>;

  /** Set of used RGB keys for fast collision detection */
  private usedColors: Set<string>;

  /** Provinces sorted by lowercase name for efficient prefix search */
  private sortedByName: ProvinceData[] = [];

  /** Next province ID to assign */
  private nextId: number;

  /** Hue cursor for golden ratio color generation */
  private hueCursor: number;

  constructor() {
    this.colorToProvince = new Map();
    this.idToProvince = new Map();
    this.usedColors = new Set();
    this.nextId = 1;
    this.hueCursor = Math.random(); // random start for visual variety
  }

  /**
   * Load provinces from parsed definition.csv data.
   */
  loadFromDefinitions(provinces: ProvinceData[]): void {
    this.colorToProvince.clear();
    this.idToProvince.clear();
    this.usedColors.clear();

    let maxId = 0;
    for (const province of provinces) {
      const key = rgbToKey(province.color);
      this.colorToProvince.set(key, province);
      this.idToProvince.set(province.id, province);
      this.usedColors.add(key);
      if (province.id > maxId) maxId = province.id;
    }

    this.nextId = maxId + 1;

    // Build sorted name index for search
    this.sortedByName = Array.from(this.idToProvince.values())
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  /**
   * Look up a province by its RGB color.
   * Returns undefined if no province is assigned to this color.
   */
  getProvinceByColor(color: RGB): ProvinceData | undefined {
    return this.colorToProvince.get(rgbToKey(color));
  }

  /**
   * Look up a province by its numeric ID.
   */
  getProvinceById(id: number): ProvinceData | undefined {
    return this.idToProvince.get(id);
  }

  /**
   * Check if an RGB color is already in use by any province. O(1).
   */
  isColorUsed(color: RGB): boolean {
    return this.usedColors.has(rgbToKey(color));
  }

  /**
   * Generate the next guaranteed-unique RGB color.
   * Uses golden ratio hue stepping in HSL for visually distinct colors,
   * with saturation 70-90% and lightness 40-60% for map readability.
   */
  suggestNextColor(): RGB {
    for (let attempts = 0; attempts < 10000; attempts++) {
      this.hueCursor = (this.hueCursor + GOLDEN_RATIO_CONJUGATE) % 1.0;

      // Vary saturation and lightness based on attempt to avoid clusters
      const saturation = 0.7 + (attempts % 3) * 0.1;
      const lightness = 0.4 + (attempts % 5) * 0.05;

      const rgb = hslToRgb(this.hueCursor, saturation, lightness);

      // Skip black (empty color) and near-black
      if (rgb.r <= 1 && rgb.g <= 1 && rgb.b <= 1) continue;

      if (!this.isColorUsed(rgb)) {
        return rgb;
      }
    }

    // Fallback: brute-force search (should never be needed)
    for (let r = 1; r < 256; r += 7) {
      for (let g = 1; g < 256; g += 7) {
        for (let b = 1; b < 256; b += 7) {
          const color: RGB = { r, g, b };
          if (!this.isColorUsed(color)) return color;
        }
      }
    }

    throw new Error('No unique colors available (all 16M colors in use?)');
  }

  /**
   * Generate a palette of unique colors related to a base hue.
   * For CK3 title hierarchies: fix hue, vary saturation and lightness.
   *
   * @param baseHue - Hue in [0, 1] range
   * @param count - Number of colors to generate
   * @returns Array of unique RGB colors in the same hue family
   */
  generatePalette(baseHue: number, count: number): RGB[] {
    const result: RGB[] = [];

    // Generate candidates across a lightness/saturation grid
    const satSteps = [0.9, 0.75, 0.6, 0.5, 0.85, 0.65];
    const lightSteps = [0.35, 0.42, 0.5, 0.58, 0.65, 0.3, 0.45, 0.55, 0.38, 0.48];

    // Small hue jitter range (+/- 5 degrees ≈ 0.014) for subtle variation
    const hueJitters = [0, 0.014, -0.014, 0.008, -0.008, 0.02, -0.02];

    outer:
    for (const hueJitter of hueJitters) {
      for (const sat of satSteps) {
        for (const light of lightSteps) {
          const hue = ((baseHue + hueJitter) % 1.0 + 1.0) % 1.0;
          const rgb = hslToRgb(hue, sat, light);

          // Skip black/near-black
          if (rgb.r <= 1 && rgb.g <= 1 && rgb.b <= 1) continue;

          if (!this.isColorUsed(rgb)) {
            result.push(rgb);
            if (result.length >= count) break outer;
          }
        }
      }
    }

    return result;
  }

  /**
   * Register a new province. Assigns the next available ID.
   * Throws if the color is already in use.
   */
  registerProvince(province: Omit<ProvinceData, 'id'>): ProvinceData {
    const key = rgbToKey(province.color);
    if (this.usedColors.has(key)) {
      throw new Error(
        `Color (${province.color.r},${province.color.g},${province.color.b}) is already in use`
      );
    }

    const fullProvince: ProvinceData = {
      ...province,
      id: this.nextId++,
      isNew: true,
    };

    this.colorToProvince.set(key, fullProvince);
    this.idToProvince.set(fullProvince.id, fullProvince);
    this.usedColors.add(key);

    return fullProvince;
  }

  /**
   * Add an already-created province (with ID assigned by backend).
   * Use this when the main process has already generated the province.
   */
  addProvince(province: ProvinceData): void {
    const key = rgbToKey(province.color);
    this.colorToProvince.set(key, province);
    this.idToProvince.set(province.id, province);
    this.usedColors.add(key);
    if (province.id >= this.nextId) {
      this.nextId = province.id + 1;
    }
  }

  /**
   * Search provinces by name prefix or exact ID match.
   * Uses binary search for efficient prefix matching on sorted name index.
   * Falls back to substring search if prefix results are insufficient.
   */
  searchProvinces(query: string, limit: number = 20): ProvinceData[] {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const results: ProvinceData[] = [];
    const seen = new Set<number>();

    // Check for numeric ID exact match first
    const asNumber = parseInt(trimmed, 10);
    if (!isNaN(asNumber) && String(asNumber) === trimmed) {
      const byId = this.idToProvince.get(asNumber);
      if (byId) {
        results.push(byId);
        seen.add(byId.id);
      }
    }

    // Binary search for prefix matches on sorted name array
    const lowerQuery = trimmed.toLowerCase();
    let lo = 0;
    let hi = this.sortedByName.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sortedByName[mid].name.toLowerCase() < lowerQuery) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // Collect prefix matches
    for (let i = lo; i < this.sortedByName.length && results.length < limit; i++) {
      const province = this.sortedByName[i];
      if (province.name.toLowerCase().startsWith(lowerQuery)) {
        if (!seen.has(province.id)) {
          results.push(province);
          seen.add(province.id);
        }
      } else {
        break;
      }
    }

    // Substring fallback if prefix didn't fill results
    if (results.length < limit) {
      for (const province of this.sortedByName) {
        if (results.length >= limit) break;
        if (!seen.has(province.id) && province.name.toLowerCase().includes(lowerQuery)) {
          results.push(province);
          seen.add(province.id);
        }
      }
    }

    return results;
  }

  /**
   * Get all registered provinces.
   */
  getAllProvinces(): ProvinceData[] {
    return Array.from(this.idToProvince.values());
  }

  /**
   * Get all new provinces (created this session, needing file stubs).
   */
  getNewProvinces(): ProvinceData[] {
    return this.getAllProvinces().filter(p => p.isNew);
  }

  /**
   * Get total province count.
   */
  get count(): number {
    return this.idToProvince.size;
  }
}

/**
 * Convert HSL to RGB (all values in [0,1] range for HSL, output 0-255 for RGB).
 */
function hslToRgb(h: number, s: number, l: number): RGB {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToChannel(p, q, h + 1 / 3);
    g = hueToChannel(p, q, h);
    b = hueToChannel(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function hueToChannel(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
