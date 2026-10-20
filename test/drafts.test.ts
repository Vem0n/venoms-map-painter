/**
 * Tests for draft save/load/list/delete operations.
 * Uses temporary directories to verify actual file I/O.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { saveDraft, listDrafts, loadDraftMetadata, deleteDraft, loadDraftImage, _sanitizeName } from '../src/main/drafts';
import { parseDefinitionCsv } from '../src/main/modfiles/definition-csv';
import type { PendingProvince, PendingSaveOptions, RGB } from '../src/shared/types';

let tmpDir: string;

/** Create a small 2x2 RGBA buffer for testing */
function makeTestBuffer(): Uint8Array {
  // 2x2 RGBA: red, green, blue, white
  return new Uint8Array([
    255, 0, 0, 255,   0, 255, 0, 255,
    0, 0, 255, 255,   255, 255, 255, 255,
  ]);
}

const testPending: PendingProvince[] = [
  {
    id: 100,
    color: { r: 200, g: 50, b: 30 },
    name: 'Test Province',
    request: {
      name: 'Test Province',
      color: { r: 200, g: 50, b: 30 },
      titleTier: 'b',
      culture: 'norse',
      religion: 'catholic',
    },
  },
];

const testSaveOptions: PendingSaveOptions = {
  definitionCsv: true,
  historyStubs: true,
  landedTitles: false,
  terrainEntries: false,
};

const testEmptyColors: RGB[] = [{ r: 0, g: 0, b: 0 }];

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'draft-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('_sanitizeName', () => {
  it('replaces spaces with hyphens', () => {
    expect(_sanitizeName('My Draft Name')).toBe('My-Draft-Name');
  });

  it('replaces illegal filename characters', () => {
    expect(_sanitizeName('Draft: "test" <1>')).toBe('Draft-test-1');
  });

  it('collapses multiple hyphens', () => {
    expect(_sanitizeName('a---b')).toBe('a-b');
  });

  it('trims leading/trailing hyphens', () => {
    expect(_sanitizeName('-test-')).toBe('test');
  });

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(100);
    expect(_sanitizeName(long).length).toBeLessThanOrEqual(60);
  });

  it('falls back to "draft" for empty/only-special input', () => {
    expect(_sanitizeName(':::')).toBe('draft');
    expect(_sanitizeName('')).toBe('draft');
  });
});

describe('saveDraft', () => {
  it('creates VMP-Drafts folder and draft subfolder', async () => {
    await saveDraft(tmpDir, 'Test Draft', makeTestBuffer(), 2, 2, {
      pendingProvinces: [],
      pendingSaveOptions: testSaveOptions,
      emptyColors: testEmptyColors,
      lockedColor: null,
    });

    const draftsDir = path.join(tmpDir, 'VMP-Drafts');
    const entries = await fs.readdir(draftsDir);
    expect(entries.length).toBe(1);
    expect(entries[0]).toMatch(/^Test-Draft_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_[A-Za-z0-9]+$/);
  });

  it('writes draft.json with correct metadata', async () => {
    await saveDraft(tmpDir, 'My Draft', makeTestBuffer(), 2, 2, {
      pendingProvinces: testPending,
      pendingSaveOptions: testSaveOptions,
      emptyColors: testEmptyColors,
      lockedColor: { r: 100, g: 50, b: 25 },
    });

    const draftsDir = path.join(tmpDir, 'VMP-Drafts');
    const folders = await fs.readdir(draftsDir);
    const jsonPath = path.join(draftsDir, folders[0], 'draft.json');
    const meta = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));

    expect(meta.name).toBe('My Draft');
    expect(meta.modPath).toBe(tmpDir);
    expect(meta.mapWidth).toBe(2);
    expect(meta.mapHeight).toBe(2);
    expect(meta.pendingProvinces).toHaveLength(1);
    expect(meta.pendingProvinces[0].name).toBe('Test Province');
    expect(meta.pendingSaveOptions.landedTitles).toBe(false);
    expect(meta.emptyColors).toHaveLength(1);
    expect(meta.lockedColor).toEqual({ r: 100, g: 50, b: 25 });
    expect(meta.timestamp).toBeTruthy();
  });

  it('writes provinces.png that exists', async () => {
    await saveDraft(tmpDir, 'PNG Test', makeTestBuffer(), 2, 2, {
      pendingProvinces: [],
      pendingSaveOptions: testSaveOptions,
      emptyColors: testEmptyColors,
      lockedColor: null,
    });

    const draftsDir = path.join(tmpDir, 'VMP-Drafts');
    const folders = await fs.readdir(draftsDir);
    const pngPath = path.join(draftsDir, folders[0], 'provinces.png');
    const stat = await fs.stat(pngPath);
    expect(stat.size).toBeGreaterThan(0);
  });
});

describe('listDrafts', () => {
  it('returns empty array when VMP-Drafts does not exist', async () => {
    const result = await listDrafts(tmpDir);
    expect(result).toEqual([]);
  });

  it('returns drafts sorted by timestamp (newest first)', async () => {
    // Save two drafts with a small delay to get different timestamps
    await saveDraft(tmpDir, 'Draft A', makeTestBuffer(), 2, 2, {
      pendingProvinces: [],
      pendingSaveOptions: testSaveOptions,
      emptyColors: testEmptyColors,
      lockedColor: null,
    });

    // Tiny delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 1100));

    await saveDraft(tmpDir, 'Draft B', makeTestBuffer(), 2, 2, {
      pendingProvinces: [],
      pendingSaveOptions: testSaveOptions,
      emptyColors: testEmptyColors,
      lockedColor: null,
    });

    const result = await listDrafts(tmpDir);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Draft B'); // Newest first
    expect(result[1].name).toBe('Draft A');
  });

  it('skips malformed draft folders', async () => {
    // Create a valid draft
    await saveDraft(tmpDir, 'Valid', makeTestBuffer(), 2, 2, {
      pendingProvinces: [],
      pendingSaveOptions: testSaveOptions,
      emptyColors: testEmptyColors,
      lockedColor: null,
    });

    // Create a malformed folder (no draft.json)
    const badDir = path.join(tmpDir, 'VMP-Drafts', 'bad-folder');
    await fs.mkdir(badDir, { recursive: true });

    const result = await listDrafts(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid');
  });
});

describe('loadDraftMetadata', () => {
  it('parses draft.json correctly', async () => {
    await saveDraft(tmpDir, 'Meta Test', makeTestBuffer(), 2, 2, {
      pendingProvinces: testPending,
      pendingSaveOptions: testSaveOptions,
      emptyColors: testEmptyColors,
      lockedColor: null,
    });

    const drafts = await listDrafts(tmpDir);
    const meta = await loadDraftMetadata(tmpDir, drafts[0].folderName);

    expect(meta.name).toBe('Meta Test');
    expect(meta.mapWidth).toBe(2);
    expect(meta.mapHeight).toBe(2);
    expect(meta.pendingProvinces).toHaveLength(1);
    expect(meta.pendingProvinces[0].request.culture).toBe('norse');
  });
});

describe('deleteDraft', () => {
  it('removes the draft folder entirely', async () => {
    await saveDraft(tmpDir, 'To Delete', makeTestBuffer(), 2, 2, {
      pendingProvinces: [],
      pendingSaveOptions: testSaveOptions,
      emptyColors: testEmptyColors,
      lockedColor: null,
    });

    const drafts = await listDrafts(tmpDir);
    expect(drafts).toHaveLength(1);

    await deleteDraft(tmpDir, drafts[0].folderName);

    const afterDelete = await listDrafts(tmpDir);
    expect(afterDelete).toHaveLength(0);
  });

  it('does not throw for non-existent draft', async () => {
    await expect(deleteDraft(tmpDir, 'nonexistent-folder')).resolves.not.toThrow();
  });
});

async function originalFiles(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const relative of await fs.readdir(tmpDir, { recursive: true })) {
    if (relative.split(path.sep)[0] === 'VMP-Drafts') continue;
    const file = path.join(tmpDir, relative);
    if ((await fs.stat(file)).isFile()) files[relative] = (await fs.readFile(file)).toString('hex');
  }
  return files;
}

describe('draft isolation and snapshots', () => {
  it('round-trips edited province data and its original mapping without touching mod files', async () => {
    await fs.mkdir(path.join(tmpDir, 'map_data'));
    await fs.mkdir(path.join(tmpDir, 'history/provinces'), { recursive: true });
    const definitionPath = path.join(tmpDir, 'map_data/definition.csv');
    await fs.writeFile(definitionPath, '0;0;0;0;x;x;\n1;255;0;0;Original;x;\n');
    await fs.writeFile(path.join(tmpDir, 'map_data/provinces.png'), 'original map bytes');
    await fs.writeFile(path.join(tmpDir, 'history/provinces/original.txt'), '# preserve me\n');
    const baseline = await parseDefinitionCsv(definitionPath);
    const provinces = [{ ...baseline[0], name: 'Draft name', culture: 'draft_culture', terrain: 'hills' }];
    const before = await originalFiles();
    await saveDraft(tmpDir, 'Snapshot', makeTestBuffer(), 2, 2, {
      provinces, sourceDefinitions: baseline, modifiedProvinceIds: [1],
      titleRenames: [{ oldKey: 'c_old', newKey: 'c_new' }],
      pendingProvinces: testPending, pendingSaveOptions: testSaveOptions,
      emptyColors: testEmptyColors, lockedColor: null,
    });
    const [draft] = await listDrafts(tmpDir);
    const metadata = await loadDraftMetadata(tmpDir, draft.folderName);
    expect(metadata.provinces).toEqual(provinces);
    expect(metadata.modifiedProvinceIds).toEqual([1]);
    expect(metadata.titleRenames).toEqual([{ oldKey: 'c_old', newKey: 'c_new' }]);
    expect(metadata.sourceDefinitions).toEqual(baseline);
    expect(await parseDefinitionCsv(path.join(tmpDir, 'VMP-Drafts', draft.folderName, 'definition.csv')))
      .toEqual([{ id: 1, color: { r: 255, g: 0, b: 0 }, name: 'Draft name' }]);
    expect(Array.from((await loadDraftImage(tmpDir, draft.folderName)).buffer)).toEqual(Array.from(makeTestBuffer()));
    expect(await originalFiles()).toEqual(before);
    // Later mod edits must not change how the draft's colors are identified.
    await fs.writeFile(definitionPath, '0;0;0;0;x;x;\n1;0;255;0;Changed externally;x;\n');
    expect((await loadDraftMetadata(tmpDir, draft.folderName)).provinces).toEqual(provinces);
  });

  it('keeps distinct versions for repeated saves of the same name', async () => {
    const state = { pendingProvinces: [], pendingSaveOptions: testSaveOptions, emptyColors: [], lockedColor: null };
    await saveDraft(tmpDir, 'Same name', makeTestBuffer(), 2, 2, state);
    const second = makeTestBuffer();
    second[0] = 17;
    await saveDraft(tmpDir, 'Same name', second, 2, 2, state);
    const drafts = await listDrafts(tmpDir);
    expect(drafts).toHaveLength(2);
    const firstPixels = await Promise.all(drafts.map(async d => (await loadDraftImage(tmpDir, d.folderName)).buffer[0]));
    expect(firstPixels.sort((a, b) => a - b)).toEqual([17, 255]);
  });

  it('does not list an incomplete draft or leave partial files after a failed save', async () => {
    await expect(saveDraft(tmpDir, 'Broken', new Uint8Array(1), 2, 2, {
      pendingProvinces: [], pendingSaveOptions: testSaveOptions, emptyColors: [], lockedColor: null,
    })).rejects.toThrow();
    expect(await listDrafts(tmpDir)).toEqual([]);
    expect(await fs.readdir(path.join(tmpDir, 'VMP-Drafts'))).toEqual([]);
    expect(await originalFiles()).toEqual({});
  });

  it('preserves an unknown baseline when resaving a legacy draft', async () => {
    await saveDraft(tmpDir, 'Legacy', makeTestBuffer(), 2, 2, {
      provinces: [], sourceDefinitions: null,
      pendingProvinces: [], pendingSaveOptions: testSaveOptions, emptyColors: [], lockedColor: null,
    });
    const [draft] = await listDrafts(tmpDir);
    expect((await loadDraftMetadata(tmpDir, draft.folderName)).sourceDefinitions).toBeNull();
  });
});
