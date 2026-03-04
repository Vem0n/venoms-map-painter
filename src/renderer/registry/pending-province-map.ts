/**
 * PendingProvinceMap — Runtime-only map of provinces created but not yet saved to disk.
 *
 * Entries live here from the moment the user clicks "Create Province" until the next save.
 * On save, entries are flushed to definition.csv (and optionally history/titles/terrain),
 * then the map is cleared. The map is destroyed when the process closes.
 */

import { rgbToKey } from '@shared/types';
import type { RGB, PendingProvince } from '@shared/types';
import type { ColorRegistry } from './color-registry';

export class PendingProvinceMap {
  private entries: Map<string, PendingProvince> = new Map();

  /** Add a pending province. Throws if color key already exists. */
  add(entry: PendingProvince): void {
    const key = rgbToKey(entry.color);
    if (this.entries.has(key)) {
      throw new Error(`Color (${entry.color.r},${entry.color.g},${entry.color.b}) is already pending`);
    }
    this.entries.set(key, entry);
  }

  /** Remove a pending province by color key. Returns true if it existed. */
  remove(colorKey: string): boolean {
    return this.entries.delete(colorKey);
  }

  /** Check if a color key is pending. */
  has(colorKey: string): boolean {
    return this.entries.has(colorKey);
  }

  /** Get a pending province by color key. */
  get(colorKey: string): PendingProvince | undefined {
    return this.entries.get(colorKey);
  }

  /** Get all pending provinces as an array, sorted by ID. */
  getAll(): PendingProvince[] {
    return Array.from(this.entries.values()).sort((a, b) => a.id - b.id);
  }

  /**
   * Re-key an entry when its color changes (e.g., harmonize).
   * Updates both the map key and the entry's color field.
   * Returns true if an entry was found and remapped.
   */
  remapColor(oldColorKey: string, newColor: RGB): boolean {
    const entry = this.entries.get(oldColorKey);
    if (!entry) return false;
    this.entries.delete(oldColorKey);
    entry.color = { ...newColor };
    const newKey = rgbToKey(newColor);
    this.entries.set(newKey, entry);
    return true;
  }

  /**
   * Renumber all pending IDs sequentially starting from nextBaseId.
   * Returns the list of ID remaps performed (empty if all IDs were already sequential).
   */
  reconcileIds(nextBaseId: number): Array<{ oldId: number; newId: number }> {
    const sorted = this.getAll();
    const remaps: Array<{ oldId: number; newId: number }> = [];
    this.entries.clear();
    let currentId = nextBaseId;
    for (const entry of sorted) {
      if (entry.id !== currentId) {
        remaps.push({ oldId: entry.id, newId: currentId });
      }
      entry.id = currentId++;
      this.entries.set(rgbToKey(entry.color), entry);
    }
    return remaps;
  }

  /**
   * Derive the max committed (non-pending) province ID from a registry.
   * Scans all provinces in the registry and excludes those present in this pending map.
   */
  static deriveMaxCommittedId(registry: ColorRegistry, pendingMap: PendingProvinceMap): number {
    let maxId = 0;
    for (const province of registry.getAllProvinces()) {
      const key = rgbToKey(province.color);
      if (!pendingMap.has(key) && province.id > maxId) {
        maxId = province.id;
      }
    }
    return maxId;
  }

  /** Clear all pending entries (e.g., after successful save or mod load). */
  clear(): void {
    this.entries.clear();
  }

  /** Number of pending provinces. */
  get count(): number {
    return this.entries.size;
  }

  /** Get the maximum pending ID, or 0 if empty. */
  get maxId(): number {
    let max = 0;
    for (const entry of this.entries.values()) {
      if (entry.id > max) max = entry.id;
    }
    return max;
  }
}
