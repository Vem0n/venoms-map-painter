/**
 * Tests for province reconciliation file cleanup functions.
 * Uses temporary directories to verify actual file I/O.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { removeProvinceHistories } from '../src/main/modfiles/history-provinces';
import { reconcileLandedTitles } from '../src/main/modfiles/landed-titles';
import { reconcileProvinceTerrain } from '../src/main/modfiles/province-terrain';
import { reconcileMapObjectLocators } from '../src/main/modfiles/map-object-locators';
import { reconcileDefaultMap } from '../src/main/modfiles/default-map';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reconcile-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('removeProvinceHistories', () => {
  it('removes a single-province file entirely', async () => {
    const histDir = path.join(tmpDir, 'history', 'provinces');
    await fs.mkdir(histDir, { recursive: true });
    await fs.writeFile(path.join(histDir, '1 - test.txt'), '1 = {\n\tculture = norse\n}\n');

    await removeProvinceHistories(histDir, new Set([1]), {});

    const files = await fs.readdir(histDir);
    expect(files).toHaveLength(0);
  });

  it('removes only the target block from a multi-province file', async () => {
    const histDir = path.join(tmpDir, 'history', 'provinces');
    await fs.mkdir(histDir, { recursive: true });
    const content = '1 = {\n\tculture = norse\n}\n2 = {\n\tculture = greek\n}\n';
    await fs.writeFile(path.join(histDir, 'combined.txt'), content);

    await removeProvinceHistories(histDir, new Set([1]), { 2: 1 });

    const result = await fs.readFile(path.join(histDir, 'combined.txt'), 'utf-8');
    // Province 1 block removed, province 2 remapped to 1
    expect(result).not.toContain('culture = norse');
    expect(result).toContain('culture = greek');
    expect(result).toContain('1 = {'); // province 2 was remapped to ID 1
  });

  it('remaps province IDs in block headers', async () => {
    const histDir = path.join(tmpDir, 'history', 'provinces');
    await fs.mkdir(histDir, { recursive: true });
    await fs.writeFile(path.join(histDir, 'test.txt'), '5 = {\n\tculture = norse\n}\n');

    await removeProvinceHistories(histDir, new Set<number>(), { 5: 3 });

    const result = await fs.readFile(path.join(histDir, 'test.txt'), 'utf-8');
    expect(result).toContain('3 = {');
    expect(result).not.toContain('5 = {');
  });

  it('preserves comments and blank lines', async () => {
    const histDir = path.join(tmpDir, 'history', 'provinces');
    await fs.mkdir(histDir, { recursive: true });
    const content = '# Header comment\n\n5 = {\n\tculture = norse\n}\n# Footer\n';
    await fs.writeFile(path.join(histDir, 'test.txt'), content);

    await removeProvinceHistories(histDir, new Set<number>(), { 5: 1 });

    const result = await fs.readFile(path.join(histDir, 'test.txt'), 'utf-8');
    expect(result).toContain('# Header comment');
    expect(result).toContain('# Footer');
    expect(result).toContain('1 = {');
  });

  it('handles empty directory gracefully', async () => {
    const histDir = path.join(tmpDir, 'nonexistent');
    // Should not throw
    await removeProvinceHistories(histDir, new Set([1]), {});
  });
});

describe('reconcileLandedTitles', () => {
  it('removes barony blocks for deleted provinces', async () => {
    const titlesDir = path.join(tmpDir, 'landed_titles');
    await fs.mkdir(titlesDir, { recursive: true });
    const content = `e_test = {
\tk_test = {
\t\td_test = {
\t\t\tc_test = {
\t\t\t\tb_one = {
\t\t\t\t\tprovince = 1
\t\t\t\t}
\t\t\t\tb_two = {
\t\t\t\t\tprovince = 2
\t\t\t\t}
\t\t\t}
\t\t}
\t}
}
`;
    await fs.writeFile(path.join(titlesDir, '00_titles.txt'), content);

    await reconcileLandedTitles(titlesDir, new Set([1]), new Set<string>(), { 2: 1 });

    const result = await fs.readFile(path.join(titlesDir, '00_titles.txt'), 'utf-8');
    expect(result).not.toContain('b_one');
    expect(result).toContain('b_two');
    expect(result).toContain('province = 1'); // b_two's province remapped from 2 to 1
  });

  it('removes confirmed parent title blocks', async () => {
    const titlesDir = path.join(tmpDir, 'landed_titles');
    await fs.mkdir(titlesDir, { recursive: true });
    const content = `d_test = {
\tc_dead = {
\t\tb_dead = {
\t\t\tprovince = 1
\t\t}
\t}
\tc_alive = {
\t\tb_alive = {
\t\t\tprovince = 2
\t\t}
\t}
}
`;
    await fs.writeFile(path.join(titlesDir, '00_titles.txt'), content);

    await reconcileLandedTitles(
      titlesDir,
      new Set([1]),
      new Set(['c_dead']),
      { 2: 1 }
    );

    const result = await fs.readFile(path.join(titlesDir, '00_titles.txt'), 'utf-8');
    expect(result).not.toContain('c_dead');
    expect(result).not.toContain('b_dead');
    expect(result).toContain('c_alive');
    expect(result).toContain('province = 1'); // remapped
  });

  it('remaps province IDs in remaining blocks', async () => {
    const titlesDir = path.join(tmpDir, 'landed_titles');
    await fs.mkdir(titlesDir, { recursive: true });
    const content = `c_test = {\n\tb_test = {\n\t\tprovince = 5\n\t}\n}\n`;
    await fs.writeFile(path.join(titlesDir, '00_titles.txt'), content);

    await reconcileLandedTitles(titlesDir, new Set<number>(), new Set<string>(), { 5: 2 });

    const result = await fs.readFile(path.join(titlesDir, '00_titles.txt'), 'utf-8');
    expect(result).toContain('province = 2');
    expect(result).not.toContain('province = 5');
  });

  it('handles nonexistent directory gracefully', async () => {
    await reconcileLandedTitles(
      path.join(tmpDir, 'nonexistent'),
      new Set([1]),
      new Set<string>(),
      {}
    );
    // Should not throw
  });
});

describe('reconcileProvinceTerrain', () => {
  it('removes terrain entries for deleted provinces', async () => {
    const terrainDir = path.join(tmpDir, 'common', 'province_terrain');
    await fs.mkdir(terrainDir, { recursive: true });
    const content = '1 = forest\n2 = hills\n3 = plains\n';
    await fs.writeFile(path.join(terrainDir, '00_province_terrain.txt'), content);

    await reconcileProvinceTerrain(tmpDir, new Set([2]), { 1: 1, 3: 2 });

    const result = await fs.readFile(path.join(terrainDir, '00_province_terrain.txt'), 'utf-8');
    expect(result).toContain('1 = forest');
    expect(result).not.toContain('2 = hills');
    expect(result).toContain('2 = plains'); // ID 3 remapped to 2
  });

  it('preserves comments and blank lines', async () => {
    const terrainDir = path.join(tmpDir, 'common', 'province_terrain');
    await fs.mkdir(terrainDir, { recursive: true });
    const content = '# Province terrain\n\n1 = forest\n# End\n';
    await fs.writeFile(path.join(terrainDir, '00_province_terrain.txt'), content);

    await reconcileProvinceTerrain(tmpDir, new Set<number>(), { 1: 1 });

    const result = await fs.readFile(path.join(terrainDir, '00_province_terrain.txt'), 'utf-8');
    expect(result).toContain('# Province terrain');
    expect(result).toContain('# End');
  });

  it('handles missing terrain file gracefully', async () => {
    // No terrain file exists — should not throw
    await reconcileProvinceTerrain(tmpDir, new Set([1]), { 2: 1 });
  });
});

describe('reconcileMapObjectLocators', () => {
  const LOCATOR_CONTENT = `game_object_locator={
\tname="buildings"
\tinstances={
\t\t{
\t\t\tid=1
\t\t\tposition={ 100.0 0.0 200.0 }
\t\t\trotation={ 0.0 0.0 0.0 1.0 }
\t\t\tscale={ 1.0 1.0 1.0 }
\t\t}
\t\t{
\t\t\tid=2
\t\t\tposition={ 300.0 0.0 400.0 }
\t\t\trotation={ 0.0 0.0 0.0 1.0 }
\t\t\tscale={ 1.0 1.0 1.0 }
\t\t}
\t\t{
\t\t\tid=3
\t\t\tposition={ 500.0 0.0 600.0 }
\t\t\trotation={ 0.0 0.0 0.0 1.0 }
\t\t\tscale={ 1.0 1.0 1.0 }
\t\t}
\t}
}
`;

  it('removes instance blocks for deleted province IDs', async () => {
    const locDir = path.join(tmpDir, 'gfx', 'map', 'map_object_data');
    await fs.mkdir(locDir, { recursive: true });
    await fs.writeFile(path.join(locDir, 'building_locators.txt'), LOCATOR_CONTENT);

    await reconcileMapObjectLocators(tmpDir, new Set([2]), { 1: 1, 3: 2 });

    const result = await fs.readFile(path.join(locDir, 'building_locators.txt'), 'utf-8');
    // Province 1 stays as id=1, province 2 removed, province 3 remapped to id=2
    expect(result).toContain('id=1');
    expect(result).not.toContain('300.0'); // position of removed province 2
    expect(result).toContain('id=2'); // province 3 remapped to 2
    expect(result).toContain('500.0'); // position of province 3 (now id=2)
    expect(result).not.toContain('id=3'); // province 3 was remapped
  });

  it('remaps province IDs in instance blocks', async () => {
    const locDir = path.join(tmpDir, 'gfx', 'map', 'map_object_data');
    await fs.mkdir(locDir, { recursive: true });
    await fs.writeFile(path.join(locDir, 'building_locators.txt'), LOCATOR_CONTENT);

    await reconcileMapObjectLocators(tmpDir, new Set<number>(), { 1: 1, 2: 2, 3: 3 });

    // No changes when IDs stay the same
    const result = await fs.readFile(path.join(locDir, 'building_locators.txt'), 'utf-8');
    expect(result).toContain('id=1');
    expect(result).toContain('id=2');
    expect(result).toContain('id=3');
  });

  it('handles missing locator files gracefully', async () => {
    // No gfx directory exists — should not throw
    await reconcileMapObjectLocators(tmpDir, new Set([1]), { 2: 1 });
  });

  it('does not modify non-province locator files', async () => {
    const locDir = path.join(tmpDir, 'gfx', 'map', 'map_object_data');
    await fs.mkdir(locDir, { recursive: true });
    const otherContent = 'game_object_locator={\n\tname="animals"\n}\n';
    await fs.writeFile(path.join(locDir, 'animals.txt'), otherContent);

    await reconcileMapObjectLocators(tmpDir, new Set([1]), { 2: 1 });

    // animals.txt should be untouched (not in LOCATOR_FILES list)
    const result = await fs.readFile(path.join(locDir, 'animals.txt'), 'utf-8');
    expect(result).toBe(otherContent);
  });
});

describe('reconcileDefaultMap', () => {
  const DEFAULT_MAP = [
    'definitions = "definition.csv"',
    'provinces = "provinces.png"',
    '',
    'sea_zones = RANGE { 10 15 }',
    'sea_zones = LIST { 20 21 22 }',
    '',
    'impassable_seas = RANGE { 10 12 }',
    'impassable_seas = RANGE { 14 15 }',
    '',
    'river_provinces = RANGE { 5 8 }',
    '',
    'lakes = LIST { 9 }',
  ].join('\n');

  it('remaps province IDs in RANGE entries', async () => {
    const mapDir = path.join(tmpDir, 'map_data');
    await fs.mkdir(mapDir, { recursive: true });
    await fs.writeFile(path.join(mapDir, 'default.map'), DEFAULT_MAP);

    // Remove province 6, remap: 5->5, 7->6, 8->7 → contiguous 5,6,7
    await reconcileDefaultMap(tmpDir, new Set([6]), { 5: 5, 7: 6, 8: 7 });

    const result = await fs.readFile(path.join(mapDir, 'default.map'), 'utf-8');
    expect(result).toContain('river_provinces = RANGE { 5 7 }');
    expect(result).not.toContain('RANGE { 5 8 }');
  });

  it('remaps province IDs in LIST entries', async () => {
    const mapDir = path.join(tmpDir, 'map_data');
    await fs.mkdir(mapDir, { recursive: true });
    await fs.writeFile(path.join(mapDir, 'default.map'), DEFAULT_MAP);

    // Remove province 21, remap: 20->19, 22->20
    await reconcileDefaultMap(tmpDir, new Set([21]), { 20: 19, 22: 20 });

    const result = await fs.readFile(path.join(mapDir, 'default.map'), 'utf-8');
    expect(result).toContain('sea_zones = LIST { 19 20 }');
    expect(result).not.toContain('21');
  });

  it('removes RANGE entries that become empty', async () => {
    const mapDir = path.join(tmpDir, 'map_data');
    await fs.mkdir(mapDir, { recursive: true });
    await fs.writeFile(path.join(mapDir, 'default.map'), DEFAULT_MAP);

    // Remove all lake provinces
    await reconcileDefaultMap(tmpDir, new Set([9]), {});

    const result = await fs.readFile(path.join(mapDir, 'default.map'), 'utf-8');
    expect(result).not.toContain('lakes');
  });

  it('preserves non-province lines unchanged', async () => {
    const mapDir = path.join(tmpDir, 'map_data');
    await fs.mkdir(mapDir, { recursive: true });
    await fs.writeFile(path.join(mapDir, 'default.map'), DEFAULT_MAP);

    await reconcileDefaultMap(tmpDir, new Set<number>(), { 5: 5, 6: 6, 7: 7, 8: 8 });

    const result = await fs.readFile(path.join(mapDir, 'default.map'), 'utf-8');
    expect(result).toContain('definitions = "definition.csv"');
    expect(result).toContain('provinces = "provinces.png"');
  });

  it('handles missing default.map gracefully', async () => {
    // No map_data directory — should not throw
    await reconcileDefaultMap(tmpDir, new Set([1]), { 2: 1 });
  });
});
