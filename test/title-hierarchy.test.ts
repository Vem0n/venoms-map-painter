import { describe, expect, it } from 'vitest';
import type { LandedTitleNode, PendingProvince, ProvinceData } from '@shared/types';
import { indexTitleHierarchy } from '@shared/title-hierarchy';
import { titleColorLookup } from '@engine/title-color-lookup';

function title(key: string, children: LandedTitleNode[] = [], provinceId?: number): LandedTitleNode {
  return { key, tier: key[0] as LandedTitleNode['tier'], children, provinceId };
}
const roots = [title('e_one', [title('k_one', [
  title('d_one', [title('c_one', [title('b_one', [], 1), title('b_two', [], 2)]), title('c_two', [title('b_three', [], 3)])]),
  title('d_two', [title('c_three', [title('b_four', [], 4)])]),
])])];
const provinces: ProvinceData[] = [1, 2, 3, 4].map(id => ({ id, name: `Province ${id}`, color: { r: id * 20, g: 30, b: 40 } }));
const pending = (id: number, parentTitle?: string, createCounty = false, parentDuchy?: string): PendingProvince => ({
  id, name: `New ${id}`, color: { r: id, g: 1, b: 2 },
  request: { name: `New ${id}`, color: { r: id, g: 1, b: 2 }, titleTier: 'b', parentTitle, createCounty, parentDuchy },
});

describe('de jure hierarchy visualization', () => {
  it('resolves county through empire membership without changing source trees', () => {
    const before = structuredClone(roots);
    const index = indexTitleHierarchy(roots, provinces, []);
    expect(index.chains.get(1)?.map(node => node.key)).toEqual(['b_one', 'c_one', 'd_one', 'k_one', 'e_one']);
    expect([...index.members.get('c_one')!]).toEqual([1, 2]);
    expect([...index.members.get('d_one')!]).toEqual([1, 2, 3]);
    expect([...index.members.get('k_one')!]).toEqual([1, 2, 3, 4]);
    expect([...index.members.get('e_one')!]).toEqual([1, 2, 3, 4]);
    expect(roots).toEqual(before);
  });

  it('uses stable title keys after ID reconciliation and excludes removed provinces', () => {
    const index = indexTitleHierarchy(roots, [{ ...provinces[1], id: 1, titleKey: 'b_two' }], []);
    expect(index.chains.get(1)?.[0].key).toBe('b_two');
    expect([...index.members.get('c_one')!]).toEqual([1]);
    expect(index.members.has('b_one')).toBe(false);
  });

  it('never assigns an unparented Voronoi province to the old owner of a reused ID', () => {
    const entry = pending(1);
    const index = indexTitleHierarchy(roots, provinces, [entry]);
    expect(index.chains.has(1)).toBe(false);
    expect([...index.members.get('c_one')!]).toEqual([2]);
  });

  it('shows explicitly assigned pending provinces under their county and ancestors', () => {
    const index = indexTitleHierarchy(roots, provinces, [pending(1, 'c_two')]);
    expect(index.chains.get(1)?.map(node => node.key)).toEqual(['b_new_1', 'c_two', 'd_one', 'k_one', 'e_one']);
    expect([...index.members.get('c_two')!]).toEqual([1, 3]);
    expect([...index.members.get('c_one')!]).toEqual([2]);
  });

  it('supports pending new counties under an existing duchy regardless of entry order', () => {
    const index = indexTitleHierarchy(roots, provinces, [pending(2, 'c_new'), pending(1, 'c_new', true, 'd_two')]);
    expect(index.chains.get(2)?.map(node => node.key)).toEqual(['b_new_2', 'c_new', 'd_two', 'k_one', 'e_one']);
    expect([...index.members.get('c_new')!]).toEqual([1, 2]);
  });

  it('leaves unknown parents and unlanded titles empty', () => {
    const index = indexTitleHierarchy([...roots, title('e_unlanded')], provinces, [pending(1, 'c_missing')]);
    expect(index.chains.has(1)).toBe(false);
    expect(index.members.has('e_unlanded')).toBe(false);
    expect(index.titles.has('e_unlanded')).toBe(true);
  });

  it('maps exact RGB values to shader texels without channel swaps or neighbor collisions', () => {
    const lookup = titleColorLookup([{ r: 12, g: 34, b: 56 }, { r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }]);
    expect(lookup[12 + 34 * 256 + 56 * 65536]).toBe(255);
    expect(lookup[255 + 255 * 256 + 255 * 65536]).toBe(255);
    expect(lookup[0]).toBe(255);
    expect(lookup[56 + 34 * 256 + 12 * 65536]).toBe(0);
    expect(lookup[13 + 34 * 256 + 56 * 65536]).toBe(0);
  });
});
