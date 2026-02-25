import { describe, it, expect, beforeEach } from 'vitest';
import { ColorRegistry } from '@registry/color-registry';
import type { ProvinceData, RGB } from '@shared/types';

function makeProvince(id: number, r: number, g: number, b: number, name: string): ProvinceData {
  return { id, color: { r, g, b }, name };
}

describe('ColorRegistry', () => {
  let registry: ColorRegistry;

  beforeEach(() => {
    registry = new ColorRegistry();
  });

  describe('loadFromDefinitions', () => {
    it('loads provinces and sets count', () => {
      const provinces = [
        makeProvince(1, 130, 12, 56, 'Normandie'),
        makeProvince(2, 255, 0, 128, 'Ile de France'),
        makeProvince(3, 50, 100, 200, 'Aquitaine'),
      ];
      registry.loadFromDefinitions(provinces);
      expect(registry.count).toBe(3);
    });

    it('clears previous data on reload', () => {
      registry.loadFromDefinitions([makeProvince(1, 10, 20, 30, 'First')]);
      expect(registry.count).toBe(1);

      registry.loadFromDefinitions([
        makeProvince(5, 40, 50, 60, 'Second'),
        makeProvince(6, 70, 80, 90, 'Third'),
      ]);
      expect(registry.count).toBe(2);
      expect(registry.getProvinceById(1)).toBeUndefined();
      expect(registry.getProvinceById(5)).toBeDefined();
    });
  });

  describe('getProvinceByColor', () => {
    it('returns province for a matching color', () => {
      registry.loadFromDefinitions([makeProvince(42, 100, 200, 50, 'TestLand')]);
      const result = registry.getProvinceByColor({ r: 100, g: 200, b: 50 });
      expect(result).toBeDefined();
      expect(result!.id).toBe(42);
      expect(result!.name).toBe('TestLand');
    });

    it('returns undefined for an unregistered color', () => {
      registry.loadFromDefinitions([makeProvince(1, 10, 20, 30, 'Only')]);
      expect(registry.getProvinceByColor({ r: 99, g: 99, b: 99 })).toBeUndefined();
    });
  });

  describe('getProvinceById', () => {
    it('returns province by numeric ID', () => {
      registry.loadFromDefinitions([makeProvince(7, 1, 2, 3, 'Seven')]);
      expect(registry.getProvinceById(7)?.name).toBe('Seven');
    });

    it('returns undefined for unknown ID', () => {
      registry.loadFromDefinitions([makeProvince(1, 1, 2, 3, 'One')]);
      expect(registry.getProvinceById(999)).toBeUndefined();
    });
  });

  describe('isColorUsed', () => {
    it('returns true for a registered color', () => {
      registry.loadFromDefinitions([makeProvince(1, 50, 60, 70, 'Used')]);
      expect(registry.isColorUsed({ r: 50, g: 60, b: 70 })).toBe(true);
    });

    it('returns false for a free color', () => {
      registry.loadFromDefinitions([makeProvince(1, 50, 60, 70, 'Used')]);
      expect(registry.isColorUsed({ r: 1, g: 2, b: 3 })).toBe(false);
    });
  });

  describe('suggestNextColor', () => {
    it('returns a unique color not already in use', () => {
      registry.loadFromDefinitions([makeProvince(1, 100, 100, 100, 'Taken')]);
      const suggested = registry.suggestNextColor();
      expect(registry.isColorUsed(suggested)).toBe(false);
    });

    it('returns different colors on successive calls', () => {
      registry.loadFromDefinitions([]);
      const a = registry.suggestNextColor();
      // Register the first so it's "used"
      registry.addProvince({ id: 1, color: a, name: 'A' });
      const b = registry.suggestNextColor();
      expect(a.r !== b.r || a.g !== b.g || a.b !== b.b).toBe(true);
    });

    it('never suggests black (empty color)', () => {
      registry.loadFromDefinitions([]);
      for (let i = 0; i < 20; i++) {
        const color = registry.suggestNextColor();
        expect(color.r <= 1 && color.g <= 1 && color.b <= 1).toBe(false);
        registry.addProvince({ id: i + 1, color, name: `P${i}` });
      }
    });
  });

  describe('registerProvince', () => {
    it('assigns sequential IDs starting after the max loaded ID', () => {
      registry.loadFromDefinitions([
        makeProvince(10, 10, 10, 10, 'Ten'),
        makeProvince(20, 20, 20, 20, 'Twenty'),
      ]);
      const p = registry.registerProvince({ color: { r: 99, g: 99, b: 99 }, name: 'New' });
      expect(p.id).toBe(21);
      expect(p.isNew).toBe(true);
    });

    it('throws if color is already in use', () => {
      registry.loadFromDefinitions([makeProvince(1, 50, 60, 70, 'Existing')]);
      expect(() => {
        registry.registerProvince({ color: { r: 50, g: 60, b: 70 }, name: 'Duplicate' });
      }).toThrow('already in use');
    });

    it('makes the province retrievable by color and id', () => {
      registry.loadFromDefinitions([]);
      const p = registry.registerProvince({ color: { r: 1, g: 2, b: 3 }, name: 'Fresh' });
      expect(registry.getProvinceById(p.id)?.name).toBe('Fresh');
      expect(registry.getProvinceByColor({ r: 1, g: 2, b: 3 })?.name).toBe('Fresh');
    });
  });

  describe('addProvince', () => {
    it('adds a province with a pre-assigned ID', () => {
      registry.loadFromDefinitions([]);
      registry.addProvince({ id: 50, color: { r: 11, g: 22, b: 33 }, name: 'Fifty' });
      expect(registry.getProvinceById(50)?.name).toBe('Fifty');
      expect(registry.count).toBe(1);
    });

    it('updates nextId if the added province has a higher ID', () => {
      registry.loadFromDefinitions([makeProvince(1, 1, 1, 1, 'One')]);
      registry.addProvince({ id: 100, color: { r: 5, g: 5, b: 5 }, name: 'Hundred' });
      const p = registry.registerProvince({ color: { r: 9, g: 9, b: 9 }, name: 'Next' });
      expect(p.id).toBe(101);
    });
  });

  describe('searchProvinces', () => {
    const provinces = [
      makeProvince(1, 10, 10, 10, 'London'),
      makeProvince(2, 20, 20, 20, 'Lombardy'),
      makeProvince(3, 30, 30, 30, 'Paris'),
      makeProvince(4, 40, 40, 40, 'Normandie'),
      makeProvince(5, 50, 50, 50, 'Nord'),
    ];

    beforeEach(() => {
      registry.loadFromDefinitions(provinces);
    });

    it('finds provinces by name prefix', () => {
      const results = registry.searchProvinces('Lon');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('London');
    });

    it('finds provinces by exact ID', () => {
      const results = registry.searchProvinces('3');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].id).toBe(3);
    });

    it('is case-insensitive', () => {
      const results = registry.searchProvinces('lom');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe('Lombardy');
    });

    it('falls back to substring search', () => {
      const results = registry.searchProvinces('aris');
      expect(results.some(p => p.name === 'Paris')).toBe(true);
    });

    it('returns empty for empty query', () => {
      expect(registry.searchProvinces('')).toEqual([]);
      expect(registry.searchProvinces('   ')).toEqual([]);
    });

    it('respects the limit parameter', () => {
      const results = registry.searchProvinces('N', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('generatePalette', () => {
    it('generates the requested number of unique colors', () => {
      registry.loadFromDefinitions([]);
      const palette = registry.generatePalette(0.5, 8);
      expect(palette.length).toBe(8);

      // All should be unique
      const keys = new Set(palette.map(c => `${c.r},${c.g},${c.b}`));
      expect(keys.size).toBe(8);
    });

    it('skips colors already in use', () => {
      const provinces = Array.from({ length: 5 }, (_, i) =>
        makeProvince(i + 1, 100 + i * 10, 50, 50, `P${i}`)
      );
      registry.loadFromDefinitions(provinces);
      const palette = registry.generatePalette(0.0, 4);
      for (const color of palette) {
        expect(registry.isColorUsed(color)).toBe(false);
      }
    });
  });

  describe('getAllProvinces / getNewProvinces', () => {
    it('getAllProvinces returns all loaded and registered provinces', () => {
      registry.loadFromDefinitions([makeProvince(1, 1, 1, 1, 'A')]);
      registry.registerProvince({ color: { r: 2, g: 2, b: 2 }, name: 'B' });
      expect(registry.getAllProvinces().length).toBe(2);
    });

    it('getNewProvinces returns only provinces with isNew flag', () => {
      registry.loadFromDefinitions([makeProvince(1, 1, 1, 1, 'Loaded')]);
      registry.registerProvince({ color: { r: 2, g: 2, b: 2 }, name: 'New' });
      const newOnes = registry.getNewProvinces();
      expect(newOnes.length).toBe(1);
      expect(newOnes[0].name).toBe('New');
    });
  });
});
