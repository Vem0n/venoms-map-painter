import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildTitleIndex, parseLandedTitles, resolveHierarchy } from '../src/main/modfiles/landed-titles';
import { indexTitleHierarchy } from '../src/shared/title-hierarchy';

let titlesDir: string;

beforeEach(async () => {
  titlesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmp-title-test-'));
});

afterEach(async () => {
  await fs.rm(titlesDir, { recursive: true, force: true });
});

describe('hegemony landed titles', () => {
  it('retains provinces nested beneath a hegemony through loading and visual membership', async () => {
    const source = '\uFEFF' + `h_arathor = {
      color = { 255 0 0 }
      # h_ignored = { e_ignored = { province = 999 } }
      can_create = { some_trigger = yes }
      e_lordaeron = {
        k_lordaeron = {
          d_lordaeron = {
            c_lordaeron = {
              b_lordaeron = { province = 269 } # capital
              b_earthview = { province = 2921 }
            }
          }
        }
      }
      e_arathor = { k_stromgarde = { c_stromgarde = { b_stromgarde = { province = 216 } } } }
    }
    e_independent = { c_independent = { b_independent = { province = 1 } } }
    h_landless = { color = { 10 20 30 } }
    `;
    await fs.writeFile(path.join(titlesDir, '01_arathor.txt'), source);

    const roots = await parseLandedTitles(titlesDir);
    const index = buildTitleIndex(roots);
    expect(roots.map(node => node.key)).toEqual(['h_arathor', 'e_independent', 'h_landless']);
    expect(roots[0]).toMatchObject({ tier: 'h', color: { r: 255, g: 0, b: 0 } });
    expect(roots[0].children.map(node => node.key)).toEqual(['e_lordaeron', 'e_arathor']);
    expect(resolveHierarchy(269, index).map(node => node.key)).toEqual([
      'b_lordaeron', 'c_lordaeron', 'd_lordaeron', 'k_lordaeron', 'e_lordaeron', 'h_arathor',
    ]);
    expect(resolveHierarchy(1, index).map(node => node.key)).toEqual(['b_independent', 'c_independent', 'e_independent']);
    expect(index.byProvinceId.has(999)).toBe(false);

    const provinces = [269, 2921, 216, 1].map(id => ({
      id, name: String(id), color: { r: 1, g: 2, b: 3 }, titleKey: index.byProvinceId.get(id)?.key,
    }));
    const visual = indexTitleHierarchy(roots, provinces, []);
    expect([...visual.members.get('h_arathor')!]).toEqual([269, 2921, 216]);
    expect([...visual.members.get('e_lordaeron')!]).toEqual([269, 2921]);
    expect(visual.members.has('h_landless')).toBe(false);
    expect(visual.chains.get(269)?.at(-1)?.tier).toBe('h');
    expect(await fs.readFile(path.join(titlesDir, '01_arathor.txt'), 'utf8')).toBe(source);
  });
});
