/**
 * Tests for PendingProvinceMap — runtime-only deferred province creation map.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PendingProvinceMap } from '../src/renderer/registry/pending-province-map';
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
      map.reconcileIds(42);
      expect(map.getAll()).toEqual([]);
      expect(map.count).toBe(0);
    });

    it('preserves entries after reconcile (retrievable by color key)', () => {
      map.add(makePending(50, 100, 200, 50, 'Test'));
      map.reconcileIds(1);
      const entry = map.get('100,200,50');
      expect(entry).toBeDefined();
      expect(entry!.id).toBe(1);
      expect(entry!.name).toBe('Test');
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
});
