/**
 * Tests for PendingProvinceMap — runtime-only deferred province creation map.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PendingProvinceMap } from '../src/renderer/registry/pending-province-map';
import { ColorRegistry } from '../src/renderer/registry/color-registry';
import type { PendingProvince, CreateProvinceRequest } from '../src/shared/types';

function makeRequest(name: string, r: number, g: number, b: number): CreateProvinceRequest {
  return { name, color: { r, g, b }, titleTier: 'b' };
}

function makePending(id: number, r: number, g: number, b: number, name = `Province ${id}`): PendingProvince {
  return {
    id,
    color: { r, g, b },
    name,
    request: makeRequest(name, r, g, b),
  };
}

describe('PendingProvinceMap', () => {
  let map: PendingProvinceMap;

  beforeEach(() => {
    map = new PendingProvinceMap();
  });

  describe('add / get / has', () => {
    it('adds and retrieves an entry by color key', () => {
      const entry = makePending(1, 100, 200, 50);
      map.add(entry);

      expect(map.has('100,200,50')).toBe(true);
      expect(map.get('100,200,50')).toBe(entry);
    });

    it('returns undefined for unknown color key', () => {
      expect(map.get('1,2,3')).toBeUndefined();
      expect(map.has('1,2,3')).toBe(false);
    });

    it('throws on duplicate color key', () => {
      map.add(makePending(1, 100, 200, 50));
      expect(() => map.add(makePending(2, 100, 200, 50))).toThrow('already pending');
    });
  });

  describe('remove', () => {
    it('removes an existing entry and returns true', () => {
      map.add(makePending(1, 10, 20, 30));
      expect(map.remove('10,20,30')).toBe(true);
      expect(map.has('10,20,30')).toBe(false);
      expect(map.count).toBe(0);
    });

    it('returns false for non-existent color key', () => {
      expect(map.remove('99,99,99')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns all entries sorted by ID', () => {
      map.add(makePending(5, 0, 0, 5));
      map.add(makePending(2, 0, 0, 2));
      map.add(makePending(8, 0, 0, 8));

      const all = map.getAll();
      expect(all.map(e => e.id)).toEqual([2, 5, 8]);
    });

    it('returns empty array when map is empty', () => {
      expect(map.getAll()).toEqual([]);
    });
  });

  describe('reconcileIds', () => {
    it('renumbers sequentially from nextBaseId', () => {
      map.add(makePending(10, 1, 0, 0, 'A'));
      map.add(makePending(12, 0, 1, 0, 'B'));
      map.add(makePending(15, 0, 0, 1, 'C'));

      map.reconcileIds(5);

      const all = map.getAll();
      expect(all.map(e => e.id)).toEqual([5, 6, 7]);
      // Names should be preserved in order
      expect(all.map(e => e.name)).toEqual(['A', 'B', 'C']);
    });

    it('fills gaps after deletion', () => {
      map.add(makePending(1, 10, 0, 0));
      map.add(makePending(2, 0, 10, 0));
      map.add(makePending(3, 0, 0, 10));
      map.remove('0,10,0'); // Remove ID 2

      map.reconcileIds(1);
      const all = map.getAll();
      expect(all.map(e => e.id)).toEqual([1, 2]);
    });

    it('works on empty map', () => {
      const remaps = map.reconcileIds(42);
      expect(map.getAll()).toEqual([]);
      expect(map.count).toBe(0);
      expect(remaps).toEqual([]);
    });

    it('preserves entries after reconcile (retrievable by color key)', () => {
      map.add(makePending(50, 100, 200, 50, 'Test'));
      map.reconcileIds(1);
      const entry = map.get('100,200,50');
      expect(entry).toBeDefined();
      expect(entry!.id).toBe(1);
      expect(entry!.name).toBe('Test');
    });

    it('returns remap list when IDs changed', () => {
      map.add(makePending(10, 1, 0, 0, 'A'));
      map.add(makePending(15, 0, 1, 0, 'B'));

      const remaps = map.reconcileIds(5);
      expect(remaps).toEqual([
        { oldId: 10, newId: 5 },
        { oldId: 15, newId: 6 },
      ]);
    });

    it('returns empty remap list when IDs already sequential', () => {
      map.add(makePending(5, 1, 0, 0, 'A'));
      map.add(makePending(6, 0, 1, 0, 'B'));
      map.add(makePending(7, 0, 0, 1, 'C'));

      const remaps = map.reconcileIds(5);
      expect(remaps).toEqual([]);
    });

    it('returns partial remaps when only some IDs changed', () => {
      map.add(makePending(5, 1, 0, 0, 'A'));
      map.add(makePending(6, 0, 1, 0, 'B'));
      map.add(makePending(8, 0, 0, 1, 'C')); // gap → will be remapped

      const remaps = map.reconcileIds(5);
      expect(remaps).toEqual([
        { oldId: 8, newId: 7 },
      ]);
    });
  });

  describe('clear', () => {
    it('empties the map', () => {
      map.add(makePending(1, 10, 0, 0));
      map.add(makePending(2, 0, 10, 0));
      map.clear();

      expect(map.count).toBe(0);
      expect(map.getAll()).toEqual([]);
      expect(map.has('10,0,0')).toBe(false);
    });
  });

  describe('count', () => {
    it('returns 0 for empty map', () => {
      expect(map.count).toBe(0);
    });

    it('reflects additions and removals', () => {
      map.add(makePending(1, 10, 0, 0));
      expect(map.count).toBe(1);
      map.add(makePending(2, 0, 10, 0));
      expect(map.count).toBe(2);
      map.remove('10,0,0');
      expect(map.count).toBe(1);
    });
  });

  describe('maxId', () => {
    it('returns 0 for empty map', () => {
      expect(map.maxId).toBe(0);
    });

    it('returns the highest ID', () => {
      map.add(makePending(3, 1, 0, 0));
      map.add(makePending(7, 0, 1, 0));
      map.add(makePending(5, 0, 0, 1));
      expect(map.maxId).toBe(7);
    });

    it('updates after removal', () => {
      map.add(makePending(3, 1, 0, 0));
      map.add(makePending(7, 0, 1, 0));
      map.remove('0,1,0'); // Remove the max
      expect(map.maxId).toBe(3);
    });
  });

  describe('remapColor', () => {
    it('re-keys an existing entry to the new color', () => {
      map.add(makePending(1, 100, 200, 50, 'TestProv'));
      const result = map.remapColor('100,200,50', { r: 10, g: 20, b: 30 });

      expect(result).toBe(true);
      expect(map.has('100,200,50')).toBe(false);
      expect(map.has('10,20,30')).toBe(true);

      const entry = map.get('10,20,30')!;
      expect(entry.id).toBe(1);
      expect(entry.name).toBe('TestProv');
      expect(entry.color).toEqual({ r: 10, g: 20, b: 30 });
    });

    it('returns false for unknown color key', () => {
      expect(map.remapColor('99,99,99', { r: 1, g: 2, b: 3 })).toBe(false);
    });

    it('preserves count after remap', () => {
      map.add(makePending(1, 100, 200, 50));
      map.add(makePending(2, 10, 20, 30));
      expect(map.count).toBe(2);

      map.remapColor('100,200,50', { r: 50, g: 60, b: 70 });
      expect(map.count).toBe(2);
    });

    it('updates entry.color to new color value', () => {
      map.add(makePending(1, 100, 200, 50));
      map.remapColor('100,200,50', { r: 1, g: 2, b: 3 });

      const entry = map.get('1,2,3')!;
      expect(entry.color.r).toBe(1);
      expect(entry.color.g).toBe(2);
      expect(entry.color.b).toBe(3);
    });
  });

  describe('deriveMaxCommittedId', () => {
    it('returns 0 when registry is empty', () => {
      const registry = new ColorRegistry();
      const result = PendingProvinceMap.deriveMaxCommittedId(registry, map);
      expect(result).toBe(0);
    });

    it('returns max ID from non-pending provinces', () => {
      const registry = new ColorRegistry();
      registry.loadFromDefinitions([
        { id: 1, color: { r: 10, g: 0, b: 0 }, name: 'A' },
        { id: 5, color: { r: 0, g: 10, b: 0 }, name: 'B' },
        { id: 3, color: { r: 0, g: 0, b: 10 }, name: 'C' },
      ]);

      const result = PendingProvinceMap.deriveMaxCommittedId(registry, map);
      expect(result).toBe(5);
    });

    it('excludes pending provinces from max calculation', () => {
      const registry = new ColorRegistry();
      registry.loadFromDefinitions([
        { id: 1, color: { r: 10, g: 0, b: 0 }, name: 'Committed A' },
        { id: 3, color: { r: 0, g: 0, b: 10 }, name: 'Committed B' },
      ]);

      // Add a province via registry that is also in pending map
      const pendingColor = { r: 0, g: 10, b: 0 };
      registry.addProvince({ id: 5, color: pendingColor, name: 'Pending' });
      map.add(makePending(5, 0, 10, 0, 'Pending'));

      const result = PendingProvinceMap.deriveMaxCommittedId(registry, map);
      expect(result).toBe(3); // max committed, excluding pending ID 5
    });

    it('returns 0 when all provinces are pending', () => {
      const registry = new ColorRegistry();
      registry.addProvince({ id: 1, color: { r: 10, g: 0, b: 0 }, name: 'P1' });
      registry.addProvince({ id: 2, color: { r: 0, g: 10, b: 0 }, name: 'P2' });
      map.add(makePending(1, 10, 0, 0, 'P1'));
      map.add(makePending(2, 0, 10, 0, 'P2'));

      const result = PendingProvinceMap.deriveMaxCommittedId(registry, map);
      expect(result).toBe(0);
    });
  });
});
