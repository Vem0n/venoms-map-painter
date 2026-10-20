import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { parseParadoxScript } from './modfiles/paradox-parser';
import type { ProjectLibrary, WorkshopProject } from '@shared/types';

const emptyLibrary = (): ProjectLibrary => ({ version: 1, workshopFolders: [], projects: [], lastScannedAt: null, warnings: [] });
const absolute = (value: string): string => {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)) throw new Error('An absolute Workshop folder path is required.');
  return path.resolve(value);
};

// Windows realpath may change drive-letter or directory casing. Native relative
// comparison respects Windows casing rules and keeps POSIX paths case-sensitive.
// It needs no filesystem access, so an offline Workshop folder can be forgotten.
const sameFolder = (left: string, right: string): boolean => path.relative(left, right) === '';

/** Expand short names/junctions even when the folder's final components are missing. */
async function removalTarget(folder: string): Promise<string> {
  const requested = absolute(folder);
  let ancestor = requested;
  const missing: string[] = [];
  while (true) {
    try { return path.join(await fs.realpath(ancestor), ...missing); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Forgetting an inaccessible/unmounted path still works using its saved name.
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return requested;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) return requested;
      missing.unshift(path.basename(ancestor));
      ancestor = parent;
    }
  }
}

/** Read descriptor display names without loading any map image or CSV contents. */
async function projectAt(modPath: string, workshopRoot: string, warnings: string[]): Promise<WorkshopProject | null> {
  try {
    const required = await Promise.all(['provinces.png', 'definition.csv'].map(file => fs.stat(path.join(modPath, 'map_data', file))));
    if (!required.every(stat => stat.isFile())) return null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') warnings.push(`${modPath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  const workshopId = path.basename(modPath);
  let name = workshopId;
  try {
    const source = (await fs.readFile(path.join(modPath, 'descriptor.mod'), 'utf8')).replace(/^\uFEFF/, '');
    const value = parseParadoxScript(source).find(node => node.type === 'value' && node.key === 'name')?.value?.trim();
    if (value) name = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).trim() || workshopId : value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push(`${modPath}/descriptor.mod: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { modPath, workshopRoot, workshopId, name, available: true };
}

/** Scan immediate Workshop item folders only, never backups, drafts, or other games. */
export async function scanWorkshopFolder(workshopRoot: string): Promise<{ projects: WorkshopProject[]; warnings: string[] }> {
  const entries = await fs.readdir(absolute(workshopRoot), { withFileTypes: true });
  const candidates = entries.filter(entry => entry.isDirectory() || entry.isSymbolicLink());
  const projects: WorkshopProject[] = [];
  const warnings: string[] = [];
  let next = 0;
  // Bound filesystem concurrency for large Workshop subscriptions.
  await Promise.all(Array.from({ length: Math.min(8, candidates.length) }, async () => {
    while (next < candidates.length) {
      const entry = candidates[next++];
      const project = await projectAt(path.join(workshopRoot, entry.name), workshopRoot, warnings);
      if (project) projects.push(project);
    }
  }));
  projects.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.modPath.localeCompare(b.modPath));
  return { projects, warnings };
}

/** Master metadata lives in app data; scanning never writes into any Workshop item. */
export class ProjectLibraryStore {
  readonly filePath: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(userDataPath: string) { this.filePath = path.join(userDataPath, 'projects.json'); }

  private async read(): Promise<ProjectLibrary> {
    let source: string;
    try { source = await fs.readFile(this.filePath, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyLibrary();
      throw error;
    }
    let data: ProjectLibrary;
    try { data = JSON.parse(source) as ProjectLibrary; }
    catch (error) { throw new Error(`Could not read project library ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`); }
    if (!data || typeof data !== 'object') throw new Error(`Invalid project library: ${this.filePath}`);
    if (data.version !== 1 || !Array.isArray(data.workshopFolders) || !data.workshopFolders.every(folder => typeof folder === 'string' && path.isAbsolute(folder)) ||
      !Array.isArray(data.projects) || !data.projects.every(project => typeof project.name === 'string' && typeof project.modPath === 'string' && path.isAbsolute(project.modPath) &&
        typeof project.workshopRoot === 'string' && data.workshopFolders.includes(project.workshopRoot) && typeof project.workshopId === 'string' && typeof project.available === 'boolean') ||
      !(data.lastScannedAt === null || typeof data.lastScannedAt === 'string') || !Array.isArray(data.warnings) || !data.warnings.every(warning => typeof warning === 'string')) {
      throw new Error(`Invalid project library: ${this.filePath}`);
    }
    return data;
  }

  async get(): Promise<ProjectLibrary> { await this.queue; return this.read(); }

  private mutate(action: (library: ProjectLibrary) => Promise<ProjectLibrary>): Promise<ProjectLibrary> {
    const result = this.queue.then(async () => {
      const library = await action(await this.read());
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify(library, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, this.filePath);
      } finally {
        await fs.rm(temporary, { force: true });
      }
      return library;
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async scan(library: ProjectLibrary, folders: string[]): Promise<ProjectLibrary> {
    let projects = library.projects.filter(project => !folders.some(folder => sameFolder(folder, project.workshopRoot)));
    const warnings: string[] = [];
    for (const folder of folders) {
      try {
        const result = await scanWorkshopFolder(folder);
        projects.push(...result.projects);
        warnings.push(...result.warnings);
      } catch (error) {
        warnings.push(`${folder}: ${error instanceof Error ? error.message : String(error)}`);
        // An unmounted library must not silently erase the remembered project names.
        projects.push(...library.projects.filter(project => sameFolder(project.workshopRoot, folder)).map(project => ({ ...project, available: false })));
      }
    }
    projects = projects.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.modPath.localeCompare(b.modPath));
    return { ...library, projects, warnings, lastScannedAt: new Date().toISOString() };
  }

  addFolder(folder: string): Promise<ProjectLibrary> {
    return this.mutate(async library => {
      const canonical = await fs.realpath(absolute(folder));
      if (!(await fs.stat(canonical)).isDirectory()) throw new Error('Choose a Workshop content folder.');
      const registered = library.workshopFolders.find(folder => sameFolder(folder, canonical));
      const workshopFolders = registered ? library.workshopFolders : [...library.workshopFolders, canonical];
      return this.scan({ ...library, workshopFolders }, [registered ?? canonical]);
    });
  }

  rescan(): Promise<ProjectLibrary> { return this.mutate(library => this.scan(library, library.workshopFolders)); }

  removeFolder(folder: string): Promise<ProjectLibrary> {
    return this.mutate(async library => {
      const target = await removalTarget(folder);
      return { ...library, workshopFolders: library.workshopFolders.filter(root => !sameFolder(root, target)),
        projects: library.projects.filter(project => !sameFolder(project.workshopRoot, target)), warnings: [] };
    });
  }
}
