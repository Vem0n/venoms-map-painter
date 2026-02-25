/**
 * Tests for province reconciliation logic — pure functions.
 */

import { describe, it, expect } from 'vitest';
import { detectOrphans, buildIdRemap, detectOrphanedParents } from '../src/renderer/reconciliation/reconcile';
import type { ProvinceData, LandedTitleNode } from '../src/shared/types';
import { rgbToKey } from '../src/shared/types';

function makeProvince(id: number, r: number, g: number, b: number, name = `Province ${id}`): ProvinceData {
  return { id, color: { r, g, b }, name };
}

function makeBarony(key: string, provinceId: number): LandedTitleNode {
  return { key, tier: 'b', provinceId, children: [] };
}

function makeTitle(key: string, tier: 'c' | 'd' | 'k' | 'e', children: LandedTitleNode[]): LandedTitleNode {
  return { key, tier, children };
}

describe('buildIdRemap', () => {
  it('builds sequential IDs starting from 1', () => {
    const provinces = [
      makeProvince(1, 10, 0, 0),
      makeProvince(2, 0, 10, 0),
      makeProvince(3, 0, 0, 10),
      makeProvince(5, 50, 0, 0),
      makeProvince(7, 0, 50, 0),
    ];
    const removed = new Set([2, 5]);
    const remap = buildIdRemap(provinces, removed);

    expect(remap.get(1)).toBe(1);
    expect(remap.get(3)).toBe(2);
    expect(remap.get(7)).toBe(3);
    expect(remap.has(2)).toBe(false);
    expect(remap.has(5)).toBe(false);
    expect(remap.size).toBe(3);
  });

  it('handles removing all provinces', () => {
    const provinces = [makeProvince(1, 10, 0, 0), makeProvince(2, 0, 10, 0)];
    const removed = new Set([1, 2]);
    const remap = buildIdRemap(provinces, removed);
    expect(remap.size).toBe(0);
  });

  it('handles removing no provinces', () => {
    const provinces = [makeProvince(1, 10, 0, 0), makeProvince(2, 0, 10, 0)];
    const removed = new Set<number>();
    const remap = buildIdRemap(provinces, removed);
    expect(remap.get(1)).toBe(1);
    expect(remap.get(2)).toBe(2);
  });

  it('preserves sort order by original ID', () => {
    const provinces = [
      makeProvince(10, 10, 0, 0),
      makeProvince(3, 0, 10, 0),
      makeProvince(7, 0, 0, 10),
    ];
    const removed = new Set([3]);
    const remap = buildIdRemap(provinces, removed);
    // Sorted: 7 -> 1, 10 -> 2
    expect(remap.get(7)).toBe(1);
    expect(remap.get(10)).toBe(2);
  });
});

describe('detectOrphans', () => {
  it('detects provinces not present on the map', () => {
    const provinces = [
      makeProvince(1, 10, 0, 0),
      makeProvince(2, 0, 10, 0),
      makeProvince(3, 0, 0, 10),
    ];
    // Only province 1 and 3 have pixels on the map
    const usedColors = new Set([rgbToKey({ r: 10, g: 0, b: 0 }), rgbToKey({ r: 0, g: 0, b: 10 })]);

    const result = detectOrphans(provinces, usedColors, []);
    expect(result.orphanedProvinces).toHaveLength(1);
    expect(result.orphanedProvinces[0].id).toBe(2);
  });

  it('returns empty when all provinces have pixels', () => {
    const provinces = [makeProvince(1, 10, 0, 0), makeProvince(2, 0, 10, 0)];
    const usedColors = new Set([rgbToKey({ r: 10, g: 0, b: 0 }), rgbToKey({ r: 0, g: 10, b: 0 })]);

    const result = detectOrphans(provinces, usedColors, []);
    expect(result.orphanedProvinces).toHaveLength(0);
  });

  it('detects all as orphaned when map is empty', () => {
    const provinces = [makeProvince(1, 10, 0, 0), makeProvince(2, 0, 10, 0)];
    const usedColors = new Set<string>();

    const result = detectOrphans(provinces, usedColors, []);
    expect(result.orphanedProvinces).toHaveLength(2);
  });
});

describe('detectOrphanedParents', () => {
  it('detects county with all baronies removed', () => {
    const tree: LandedTitleNode[] = [
      makeTitle('d_test', 'd', [
        makeTitle('c_test', 'c', [
          makeBarony('b_one', 1),
          makeBarony('b_two', 2),
        ]),
      ]),
    ];
    // Remove both baronies
    const removed = new Set([1, 2]);
    const result = detectOrphanedParents(tree, removed);

    // County c_test should be orphaned (not the duchy, since it's reported at the deepest fully-orphaned level)
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('d_test');
    expect(result[0].totalBaronies).toBe(2);
  });

  it('does not report county when some baronies remain', () => {
    const tree: LandedTitleNode[] = [
      makeTitle('c_test', 'c', [
        makeBarony('b_one', 1),
        makeBarony('b_two', 2),
      ]),
    ];
    const removed = new Set([1]); // Only one removed
    const result = detectOrphanedParents(tree, removed);
    expect(result).toHaveLength(0);
  });

  it('cascades up when duchy loses all counties', () => {
    const tree: LandedTitleNode[] = [
      makeTitle('d_test', 'd', [
        makeTitle('c_one', 'c', [makeBarony('b_one', 1)]),
        makeTitle('c_two', 'c', [makeBarony('b_two', 2)]),
      ]),
    ];
    const removed = new Set([1, 2]);
    const result = detectOrphanedParents(tree, removed);

    // The duchy itself should be orphaned (reports at highest level)
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('d_test');
    expect(result[0].tier).toBe('d');
    expect(result[0].totalBaronies).toBe(2);
  });

  it('reports individual orphaned counties when duchy partially survives', () => {
    const tree: LandedTitleNode[] = [
      makeTitle('d_test', 'd', [
        makeTitle('c_dead', 'c', [makeBarony('b_dead', 1)]),
        makeTitle('c_alive', 'c', [makeBarony('b_alive', 2)]),
      ]),
    ];
    const removed = new Set([1]); // Only c_dead's barony removed
    const result = detectOrphanedParents(tree, removed);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('c_dead');
    expect(result[0].tier).toBe('c');
  });

  it('returns empty when no baronies are removed', () => {
    const tree: LandedTitleNode[] = [
      makeTitle('c_test', 'c', [makeBarony('b_one', 1)]),
    ];
    const result = detectOrphanedParents(tree, new Set());
    expect(result).toHaveLength(0);
  });
});
