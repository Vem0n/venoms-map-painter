/**
 * PendingProvinceMap — Runtime-only map of provinces created but not yet saved to disk.
 *
 * Entries live here from the moment the user clicks "Create Province" until the next save.
 * On save, entries are flushed to definition.csv (and optionally history/titles/terrain),
 * then the map is cleared. The map is destroyed when the process closes.
 */

import { rgbToKey } from '@shared/types';
import type { PendingProvince } from '@shared/types';

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
   * Renumber all pending IDs sequentially starting from nextBaseId.
   * Used before save to fill gaps from deletions.
   */
  reconcileIds(nextBaseId: number): void {
    const sorted = this.getAll();
    this.entries.clear();
    let currentId = nextBaseId;
    for (const entry of sorted) {
      entry.id = currentId++;
      this.entries.set(rgbToKey(entry.color), entry);
    }
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
