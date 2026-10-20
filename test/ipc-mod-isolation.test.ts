import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { IpcMainInvokeEvent } from 'electron';
import { PNG } from 'pngjs';
import type { LoadModResult, PendingProvince } from '@shared/types';

const { handlers, logging } = vi.hoisted(() => ({
  logging: { directory: "" },
  handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(),
}));

// Keep real ModFileManager and file I/O; only substitute Electron's transport.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn((channel, handler) => handlers.set(channel, handler)) },
  dialog: {},
  app: { getPath: () => logging.directory, getVersion: () => "test" },
}));

import { registerIpcHandlers } from '../src/main/ipc';

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
  // Electron transports copies, not references into the main-process manager.
  return structuredClone(await handler({} as IpcMainInvokeEvent, ...structuredClone(args))) as T;
}

async function createMod(root: string, name: string): Promise<string> {
  const modPath = path.join(root, name);
  const files = {
    'map_data/definition.csv': `0;0;0;0;x;x;\n1;12;34;56;${name} Capital;x;\n2;78;90;123;${name} Spare;x;\n`,
    [`common/landed_titles/${name}.txt`]: `c_${name} = {\n b_capital = { province = 1 }\n b_spare = { province = 2 }\n}\n`,
    [`history/provinces/${name}.txt`]: `1 = {\n culture = ${name}_culture\n religion = ${name}_faith\n holding = castle_holding\n}\n2 = {\n culture = ${name}_culture\n}\n`,
    'common/province_terrain/00_province_terrain.txt': 'default = plains\n1 = plains\n2 = hills\n',
    'map_data/default.map': 'sea_zones = { 2 }\n',
  };
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(modPath, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
  }
  await fs.writeFile(path.join(modPath, 'map_data/provinces.png'), PNG.sync.write({
    width: 2, height: 1, data: Buffer.from([12, 34, 56, 255, 78, 90, 123, 255]),
  }));
  return modPath;
}

async function snapshotMod(modPath: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const relative of await fs.readdir(modPath, { recursive: true })) {
    const file = path.join(modPath, relative);
    if ((await fs.stat(file)).isFile()) result[relative] = (await fs.readFile(file)).toString('hex');
  }
  return result;
}

let tmpDir: string;
let modA: string;
let modB: string;
let loadedA: LoadModResult;
let beforeB: Record<string, string>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmp-mod-isolation-'));
  logging.directory = path.join(tmpDir, 'profile');
  modA = await createMod(tmpDir, 'a');
  modB = await createMod(tmpDir, 'b');
  handlers.clear();
  registerIpcHandlers();
  loadedA = await invoke<LoadModResult>('load-mod', modA);
  expect(loadedA.success).toBe(true);
  expect((await invoke<LoadModResult>('load-mod', modB)).success).toBe(true);
  beforeB = await snapshotMod(modB);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('mod-scoped IPC', () => {
  it('reads each mod hierarchy and history list after another mod is loaded', async () => {
    expect(await invoke('get-hierarchy', modA, 1)).toEqual([
      expect.objectContaining({ key: 'b_capital' }), expect.objectContaining({ key: 'c_a' }),
    ]);
    expect(await invoke('list-history-files', modA)).toEqual(['a.txt']);
    expect(await invoke('list-history-files', modB)).toEqual(['b.txt']);
  });

  it('saves A image and metadata without changing any B files or creating B backups', async () => {
    const provinces = loadedA.data!.provinces;
    provinces[0] = { ...provinces[0], name: 'Edited A', culture: 'edited_a', terrain: 'forest' };
    await invoke('save-image', modA, new Uint8Array([12, 34, 56, 255]), 1, 1);
    await invoke('save-mod', modA, { provinces, modifiedProvinceIds: [1] });

    expect(await fs.readFile(path.join(modA, 'map_data/definition.csv'), 'utf8')).toContain('Edited A');
    expect(await fs.readFile(path.join(modA, 'history/provinces/a.txt'), 'utf8')).toContain('edited_a');
    expect(await fs.readFile(path.join(modA, 'common/province_terrain/00_province_terrain.txt'), 'utf8')).toContain('forest');
    expect(PNG.sync.read(await fs.readFile(path.join(modA, 'map_data/provinces.png'))).width).toBe(1);
    expect(await snapshotMod(modB)).toEqual(beforeB);
  });

  it('renames a title only in the requested mod even when both mods share the title key', async () => {
    expect(await invoke('rename-title', modA, 'b_capital', 'b_capital_a')).toBe(true);
    expect(await fs.readFile(path.join(modA, 'common/landed_titles/a.txt'), 'utf8')).toContain('b_capital_a');
    expect(await snapshotMod(modB)).toEqual(beforeB);
  });

  it('creates province stubs only in the requested mod', async () => {
    await invoke('create-province', modA, {
      name: 'Created A', color: { r: 111, g: 112, b: 113 }, titleTier: 'b',
      culture: 'new_a_culture', terrain: 'forest', parentTitle: 'c_a',
    });
    expect(await fs.readFile(path.join(modA, 'map_data/definition.csv'), 'utf8')).toContain('Created A');
    expect(await snapshotMod(modB)).toEqual(beforeB);
  });

  it('flushes pending provinces only into the requested mod', async () => {
    const province: PendingProvince = {
      id: 3, name: 'Pending A', color: { r: 111, g: 112, b: 113 },
      request: { name: 'Pending A', color: { r: 111, g: 112, b: 113 }, titleTier: 'b', parentTitle: 'c_a', terrain: 'forest' },
    };
    await invoke('flush-pending-provinces', modA, {
      provinces: [province],
      options: { definitionCsv: true, historyStubs: true, landedTitles: true, terrainEntries: true },
    });
    expect(await fs.readFile(path.join(modA, 'map_data/definition.csv'), 'utf8')).toContain('Pending A');
    expect(await snapshotMod(modB)).toEqual(beforeB);
  });

  it('reconciles only the requested mod', async () => {
    await invoke('reconcile-provinces', modA, {
      removedIds: [2], idMap: { 1: 1 }, removedTitleKeys: [], provinces: [loadedA.data!.provinces[0]],
    });
    expect(await fs.readFile(path.join(modA, 'map_data/definition.csv'), 'utf8')).not.toContain('a Spare');
    expect(await fs.readFile(path.join(modA, 'common/landed_titles/a.txt'), 'utf8')).not.toContain('b_spare');
    expect(await snapshotMod(modB)).toEqual(beforeB);
  });

  it('rejects missing or unloaded mod paths without falling back to another mod', async () => {
    const beforeA = await snapshotMod(modA);
    for (const target of [undefined, '', path.join(tmpDir, 'not-loaded')]) {
      await expect(invoke('save-mod', target, { provinces: [], modifiedProvinceIds: [] })).rejects.toThrow();
      await expect(invoke('get-hierarchy', target, 1)).rejects.toThrow();
    }
    expect(await snapshotMod(modA)).toEqual(beforeA);
    expect(await snapshotMod(modB)).toEqual(beforeB);
  });

  it('keeps other mods available after a failed load and after overlapping loads', async () => {
    expect((await invoke<LoadModResult>('load-mod', path.join(tmpDir, 'missing'))).success).toBe(false);
    expect(await invoke('list-history-files', modA)).toEqual(['a.txt']);
    await Promise.all([invoke('load-mod', modA), invoke('load-mod', modB)]);
    expect(await invoke('list-history-files', modA)).toEqual(['a.txt']);
    expect(await invoke('list-history-files', modB)).toEqual(['b.txt']);
  });
});


describe('reconciliation title protection', () => {
  it('rejects deletion of a parent containing a kept province before creating backups or writing', async () => {
    const beforeA = await snapshotMod(modA);
    await expect(invoke('reconcile-provinces', modA, {
      removedIds: [2], removedTitleKeys: ['c_a'], idMap: { 1: 1 },
      provinces: [loadedA.data!.provinces[0]],
    })).rejects.toThrow('surviving provinces');
    expect(await snapshotMod(modA)).toEqual(beforeA);
    expect(await snapshotMod(modB)).toEqual(beforeB);
  });
});

describe('save diagnostics across IPC', () => {
  it('returns the original main-process error log without duplicating it in renderer reporting', async () => {
    const originalWrite = fs.writeFile.bind(fs);
    const failure = new Error('Injected definition write failure');
    failure.stack = 'Error: Injected definition write failure\n    at originalDiskFrame (/main/definition.ts:123)';
    const spy = vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
      if (String(file) === path.join(modA, 'map_data/definition.csv')) throw failure;
      return originalWrite(file, data, options);
    });
    try {
      await expect(invoke('save-mod', modA, { provinces: loadedA.data!.provinces })).rejects.toThrow(failure.message);
    } finally {
      spy.mockRestore();
    }
    const report = await invoke<{ logPath: string; message: string }>('report-save-failure', {
      operation: 'renderer-save', message: `Remote error: ${failure.message}`, stack: 'Renderer stack only', target: modA,
    });
    expect(report.message).toBe(failure.message);
    expect(await fs.readFile(report.logPath, 'utf8')).toContain('originalDiskFrame');
    expect(await fs.readFile(report.logPath, 'utf8')).not.toContain('Renderer stack only');
    expect(await fs.readdir(path.join(logging.directory, 'logs'))).toHaveLength(1);
    expect(await snapshotMod(modB)).toEqual(beforeB);
  });
});
