import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ProjectLibraryStore, scanWorkshopFolder } from '../src/main/project-library';

let root: string;
let workshop: string;
let store: ProjectLibraryStore;

async function mod(parent: string, id: string, descriptor?: string): Promise<string> {
  const folder = path.join(parent, id);
  await fs.mkdir(path.join(folder, 'map_data'), { recursive: true });
  // A scan should never decode the map or parse the definition rows.
  await fs.writeFile(path.join(folder, 'map_data/provinces.png'), 'not decoded during scanning');
  await fs.writeFile(path.join(folder, 'map_data/definition.csv'), 'not parsed during scanning');
  if (descriptor !== undefined) await fs.writeFile(path.join(folder, 'descriptor.mod'), descriptor);
  return folder;
}

async function snapshot(folder: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const relative of await fs.readdir(folder, { recursive: true })) {
    const file = path.join(folder, relative);
    const stat = await fs.stat(file, { bigint: true });
    result[relative] = stat.isDirectory() ? `directory:${stat.mtimeNs}` : `${stat.mtimeNs}:${(await fs.readFile(file)).toString('hex')}`;
  }
  return result;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vmp-project-library-'));
  workshop = path.join(root, 'workshop');
  await fs.mkdir(workshop);
  store = new ProjectLibraryStore(path.join(root, 'profile'));
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('Workshop discovery', () => {
  it('finds only direct children containing both required files and reads top-level descriptor names', async () => {
    await mod(workshop, '100', '\uFEFFtags = { name = "Not the mod name" }\nname = "Élder Kings \\"Two\\" # inside quotes" # comment\n');
    const missingCsv = await mod(workshop, '200', 'name = "No CSV"');
    await fs.unlink(path.join(missingCsv, 'map_data/definition.csv'));
    const missingMap = await mod(workshop, '300', 'name = "No map"');
    await fs.unlink(path.join(missingMap, 'map_data/provinces.png'));
    await mod(path.join(workshop, 'nested'), '400', 'name = "Nested project is not a Workshop item"');
    await fs.writeFile(path.join(workshop, 'plain-file'), 'not a mod');
    const result = await scanWorkshopFolder(workshop);
    expect(result.projects).toEqual([{ modPath: path.join(workshop, '100'), workshopRoot: workshop, workshopId: '100', name: 'Élder Kings "Two" # inside quotes', available: true }]);
  });

  it('falls back to folder names when descriptors are missing or have no display name', async () => {
    await mod(workshop, '100');
    await mod(workshop, '200', 'supported_version = "1.*"\n');
    const unreadable = await mod(workshop, '300');
    await fs.mkdir(path.join(unreadable, 'descriptor.mod'));
    const result = await scanWorkshopFolder(workshop);
    expect(result.projects.map(project => project.name)).toEqual(['100', '200', '300']);
    expect(result.warnings).toHaveLength(1);
  });

  it('requires regular map and CSV files rather than matching directory names', async () => {
    const invalid = await mod(workshop, '100');
    await fs.unlink(path.join(invalid, 'map_data/definition.csv'));
    await fs.mkdir(path.join(invalid, 'map_data/definition.csv'));
    expect((await scanWorkshopFolder(workshop)).projects).toEqual([]);
  });
});

describe('master project metadata', () => {
  it('does not write on first read and persists configured projects across store instances', async () => {
    expect((await store.get()).projects).toEqual([]);
    await expect(fs.access(store.filePath)).rejects.toThrow();
    await mod(workshop, '123', 'name = "AGOT Test"\n');
    const saved = await store.addFolder(workshop);
    expect(saved.workshopFolders).toEqual([await fs.realpath(workshop)]);
    expect(saved.lastScannedAt).toBeTruthy();
    expect(await new ProjectLibraryStore(path.join(root, 'profile')).get()).toEqual(saved);
    expect(path.dirname(store.filePath)).toBe(path.join(root, 'profile'));
  });

  it('never modifies mod files, drafts, backups or directory entries while scanning or forgetting folders', async () => {
    const project = await mod(workshop, '123', 'name = "Read only discovery"');
    await fs.mkdir(path.join(project, 'VMP-Drafts/example'), { recursive: true });
    await fs.mkdir(path.join(project, 'VMP-Backups/example'), { recursive: true });
    await fs.writeFile(path.join(project, 'VMP-Drafts/example/draft.json'), '{"existing":true}');
    await fs.writeFile(path.join(project, 'VMP-Backups/example/backup.txt'), 'existing backup');
    const before = await snapshot(workshop);
    await store.addFolder(workshop);
    await store.rescan();
    await store.removeFolder(workshop);
    expect(await snapshot(workshop)).toEqual(before);
    expect((await store.get()).workshopFolders).toEqual([]);
    expect((await store.get()).projects).toEqual([]);
  });

  it('rescans changed names, new subscriptions and removed map files without keeping stale items', async () => {
    const first = await mod(workshop, '100', 'name = "Old name"');
    await store.addFolder(workshop);
    await fs.writeFile(path.join(first, 'descriptor.mod'), 'name = "Updated name"');
    const second = await mod(workshop, '200', 'name = "New subscription"');
    expect((await store.rescan()).projects.map(project => project.name).sort()).toEqual(['New subscription', 'Updated name']);
    await fs.unlink(path.join(second, 'map_data/provinces.png'));
    expect((await store.rescan()).projects.map(project => project.name)).toEqual(['Updated name']);
  });

  it('retains unavailable folders and names, then recovers them on a later rescan', async () => {
    await mod(workshop, '100', 'name = "Remember me"');
    await store.addFolder(workshop);
    const offline = path.join(root, 'offline');
    await fs.rename(workshop, offline);
    const unavailable = await store.rescan();
    expect(unavailable.projects[0]).toMatchObject({ name: 'Remember me', available: false });
    expect(unavailable.warnings).toHaveLength(1);
    await fs.rename(offline, workshop);
    const recovered = await store.rescan();
    expect(recovered.projects[0].available).toBe(true);
    expect(recovered.warnings).toEqual([]);
  });

  it('serializes concurrent folder changes and deduplicates repeated folder additions', async () => {
    const other = path.join(root, 'other-workshop');
    await mod(workshop, '100', 'name = "First library"');
    await mod(other, '200', 'name = "Second library"');
    await Promise.all([store.addFolder(workshop), store.addFolder(other)]);
    expect((await store.get()).projects).toHaveLength(2);
    await store.addFolder(path.join(workshop, '.'));
    expect((await store.get()).workshopFolders).toHaveLength(2);
    await Promise.all([store.removeFolder(workshop), store.rescan()]);
    expect((await store.get()).projects.map(project => project.name)).toEqual(['Second library']);
  });

  it('refuses to overwrite corrupt master metadata', async () => {
    await fs.mkdir(path.dirname(store.filePath), { recursive: true });
    await fs.writeFile(store.filePath, '{"broken":');
    await expect(store.addFolder(workshop)).rejects.toThrow();
    expect(await fs.readFile(store.filePath, 'utf8')).toBe('{"broken":');
  });

  it('preserves the previous library after a failed metadata write and supports retry', async () => {
    await mod(workshop, '100', 'name = "Original"');
    await store.addFolder(workshop);
    const previous = await fs.readFile(store.filePath, 'utf8');
    await mod(workshop, '200', 'name = "Added later"');
    const rename = fs.rename.bind(fs);
    const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to) === store.filePath) throw new Error('Injected metadata write failure');
      return rename(from, to);
    });
    try { await expect(store.rescan()).rejects.toThrow('Injected metadata write failure'); }
    finally { spy.mockRestore(); }
    expect(await fs.readFile(store.filePath, 'utf8')).toBe(previous);
    expect(await fs.readdir(path.dirname(store.filePath))).toEqual(['projects.json']);
    expect((await store.rescan()).projects).toHaveLength(2);
  });
});
