/**
 * ModFileManager — Orchestrates all CK3 mod file operations.
 *
 * Reads and writes the complete mod directory structure.
 * Generates file stubs when new provinces are created.
 * All operations are save-triggered (not live sync).
 *
 * Backup-before-write: before any save, copies affected files to
 * /backups/{timestamp}/ so nothing is permanently lost.
 */

import path from 'path';
import fs from 'fs/promises';
import { ProvinceData, ModData, LoadModResult, CreateProvinceRequest, LandedTitleNode, ReconcileRequest } from '@shared/types';
import { parseDefinitionCsv, writeDefinitionCsv } from './definition-csv';
import {
  parseLandedTitles,
  buildTitleIndex,
  TitleIndex,
  resolveHierarchy,
  insertTitle,
  appendToTitleFile,
  generateBaronyBlock,
  generateCountyStub,
  renameTitleInFile,
} from './landed-titles';
import { parseProvinceHistories, saveProvinceHistory, generateProvinceStub, removeProvinceHistories } from './history-provinces';
import { parseProvinceTerrain, saveProvinceTerrain, reconcileProvinceTerrain } from './province-terrain';
import { reconcileLandedTitles } from './landed-titles';
import { reconcileMapObjectLocators } from './map-object-locators';
import { reconcileDefaultMap } from './default-map';

export class ModFileManager {
  private modPath: string;
  private provinces: ProvinceData[] = [];
  private landedTitles: LandedTitleNode[] = [];
  private titleIndex: TitleIndex | null = null;

  constructor(modPath: string) {
    this.modPath = modPath;
  }

  /**
   * Load the entire mod directory structure.
   * Parses definition.csv, landed_titles, and history files.
   */
  async load(): Promise<LoadModResult> {
    try {
      // 1. Verify directory structure
      await this.validateModDirectory();

      // 2. Parse definition.csv
      const defPath = path.join(this.modPath, 'map_data', 'definition.csv');
      this.provinces = await parseDefinitionCsv(defPath);

      // 3. Parse landed_titles
      const titlesDir = path.join(this.modPath, 'common', 'landed_titles');
      this.landedTitles = await parseLandedTitles(titlesDir);
      this.titleIndex = buildTitleIndex(this.landedTitles);

      // 4. Parse history files (enrich provinces with culture/religion/holding)
      const histDir = path.join(this.modPath, 'history', 'provinces');
      this.provinces = await parseProvinceHistories(histDir, this.provinces);

      // 5. Parse province terrain (common/province_terrain/00_province_terrain.txt)
      await parseProvinceTerrain(this.modPath, this.provinces);

      // 6. Cross-reference provinces with title data
      if (this.titleIndex) {
        for (const province of this.provinces) {
          const barony = this.titleIndex.byProvinceId.get(province.id);
          if (barony) {
            province.titleKey = barony.key;
            province.titleTier = 'b';
          }
        }
      }

      return {
        success: true,
        data: {
          rootPath: this.modPath,
          provinces: this.provinces,
          landedTitles: this.landedTitles,
          isDirty: false,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Get the de jure hierarchy for a province.
   * Returns array from barony up to empire.
   */
  getHierarchy(provinceId: number): LandedTitleNode[] {
    if (!this.titleIndex) return [];
    return resolveHierarchy(provinceId, this.titleIndex);
  }

  /**
   * Save all modified files back to disk.
   * Backs up affected files first.
   */
  async save(data: {
    provinces: ProvinceData[];
    modifiedProvinceIds?: number[];
  }): Promise<void> {
    // 1. Create timestamped backup directory
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const backupDir = path.join(this.modPath, 'backups', stamp);
    await fs.mkdir(backupDir, { recursive: true });

    // 2. Backup and write definition.csv
    const defPath = path.join(this.modPath, 'map_data', 'definition.csv');
    await this.backupFile(defPath, backupDir);
    await writeDefinitionCsv(defPath, data.provinces);

    // 3. Write modified province history files
    const histDir = path.join(this.modPath, 'history', 'provinces');
    const idsToSave = data.modifiedProvinceIds
      ? new Set(data.modifiedProvinceIds)
      : null;

    for (const province of data.provinces) {
      // Only save provinces that were modified or are new
      if (idsToSave && !idsToSave.has(province.id) && !province.isNew) continue;

      // Backup existing history file if present
      if (province.historyFile) {
        const histFile = path.join(histDir, province.historyFile);
        await this.backupFile(histFile, backupDir);
      }

      await saveProvinceHistory(histDir, province);
    }

    // 4. Write province terrain
    const terrainFile = path.join(this.modPath, 'common', 'province_terrain', '00_province_terrain.txt');
    await this.backupFile(terrainFile, backupDir);
    await saveProvinceTerrain(this.modPath, data.provinces, idsToSave ?? undefined);

    this.provinces = data.provinces;
  }

  /**
   * List all history province files in the mod directory.
   * Returns filenames only (not full paths).
   */
  async getHistoryFiles(): Promise<string[]> {
    const histDir = path.join(this.modPath, 'history', 'provinces');
    try {
      const files = await fs.readdir(histDir);
      return files.filter(f => f.endsWith('.txt')).sort();
    } catch {
      return [];
    }
  }

  /**
   * Generate file stubs for a new province.
   * Creates entries in history/provinces and optionally landed_titles.
   */
  async createProvinceStubs(request: CreateProvinceRequest): Promise<ProvinceData> {
    // Assign next ID
    let maxId = 0;
    for (const p of this.provinces) {
      if (p.id > maxId) maxId = p.id;
    }
    const newId = maxId + 1;

    const province: ProvinceData = {
      id: newId,
      color: request.color,
      name: request.name,
      titleTier: request.titleTier,
      culture: request.culture,
      religion: request.religion,
      holding: request.holding,
      terrain: request.terrain,
      historyFile: request.historyFile,
      isNew: true,
    };

    // 1. Append to definition.csv immediately
    const defPath = path.join(this.modPath, 'map_data', 'definition.csv');
    const defLine = `${newId};${request.color.r};${request.color.g};${request.color.b};${request.name};x;`;
    // Ensure we start on a new line — the file may not end with a newline
    const existing = await fs.readFile(defPath, 'utf-8');
    const needsNewline = existing.length > 0 && !existing.endsWith('\n') && !existing.endsWith('\r\n');
    await fs.appendFile(defPath, (needsNewline ? '\n' : '') + defLine + '\n', 'utf-8');

    // 2. Generate history stub (culture/religion/holding)
    const histDir = path.join(this.modPath, 'history', 'provinces');
    await generateProvinceStub(histDir, province);

    // 3. Write terrain entry
    if (request.terrain) {
      await saveProvinceTerrain(this.modPath, [province]);
    }

    // 4. Generate landed_titles entry
    if (request.parentTitle) {
      const baronyKey = `b_${request.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      province.titleKey = baronyKey;

      const titlesDir = path.join(this.modPath, 'common', 'landed_titles');
      let files: string[];
      try {
        files = await fs.readdir(titlesDir);
      } catch {
        files = [];
      }

      if (request.createCounty) {
        // Create a NEW county containing the barony
        const countyKey = request.parentTitle; // e.g. c_my_county
        const indent = request.parentDuchy ? getChildIndent(request.parentDuchy) : '\t\t';
        const block = generateCountyStub(countyKey, baronyKey, newId, request.color, indent);

        let inserted = false;
        if (request.parentDuchy) {
          // Insert the new county under the specified duchy
          for (const file of files) {
            if (!file.endsWith('.txt')) continue;
            const filePath = path.join(titlesDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            if (content.includes(request.parentDuchy)) {
              inserted = await appendToTitleFile(filePath, request.parentDuchy, block);
              if (inserted) break;
            }
          }
        }

        if (!inserted) {
          // No parent duchy or duchy not found — append to first .txt file (or create one)
          const targetFile = files.find(f => f.endsWith('.txt'));
          const filePath = targetFile
            ? path.join(titlesDir, targetFile)
            : path.join(titlesDir, '00_landed_titles.txt');

          if (!targetFile) {
            await fs.mkdir(titlesDir, { recursive: true });
            await fs.writeFile(filePath, '', 'utf-8');
          }

          const eol = '\n';
          await fs.appendFile(filePath, eol + block + eol, 'utf-8');
          inserted = true;
        }

        // Update in-memory title tree
        if (inserted) {
          const baronyNode: LandedTitleNode = {
            key: baronyKey,
            tier: 'b',
            provinceId: newId,
            children: [],
          };
          const countyNode: LandedTitleNode = {
            key: countyKey,
            tier: 'c',
            children: [baronyNode],
          };

          if (request.parentDuchy) {
            insertTitle(this.landedTitles, request.parentDuchy, countyNode);
          } else {
            // Top-level county (no duchy parent)
            this.landedTitles.push(countyNode);
          }
          this.titleIndex = buildTitleIndex(this.landedTitles);
        }
      } else {
        // Add barony under existing county
        let inserted = false;
        for (const file of files) {
          if (!file.endsWith('.txt')) continue;
          const filePath = path.join(titlesDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          if (content.includes(request.parentTitle)) {
            const indent = getChildIndent(request.parentTitle);
            const block = generateBaronyBlock(baronyKey, newId, indent);
            inserted = await appendToTitleFile(filePath, request.parentTitle, block);
            if (inserted) break;
          }
        }

        // Update in-memory title tree
        if (inserted) {
          const newTitle: LandedTitleNode = {
            key: baronyKey,
            tier: 'b',
            provinceId: newId,
            children: [],
          };
          insertTitle(this.landedTitles, request.parentTitle, newTitle);
          this.titleIndex = buildTitleIndex(this.landedTitles);
        }
      }
    }

    this.provinces.push(province);
    return province;
  }

  /**
   * Rename a title key in the landed_titles files and in-memory tree.
   * Performs a find-and-replace of the key in the source file.
   */
  async renameTitleKey(oldKey: string, newKey: string): Promise<boolean> {
    if (!this.titleIndex) return false;

    const node = this.titleIndex.byKey.get(oldKey);
    if (!node) return false;

    // Find and update the file on disk
    const titlesDir = path.join(this.modPath, 'common', 'landed_titles');
    const updated = await renameTitleInFile(titlesDir, oldKey, newKey);
    if (!updated) return false;

    // Update in-memory tree
    node.key = newKey;

    // Update any province that references this title
    if (node.tier === 'b') {
      for (const p of this.provinces) {
        if (p.titleKey === oldKey) p.titleKey = newKey;
      }
    }

    // Rebuild index
    this.titleIndex = buildTitleIndex(this.landedTitles);
    return true;
  }

  /**
   * Reconcile province files after orphan removal.
   * Creates a timestamped backup, removes orphaned entries from all mod files,
   * and remaps province IDs to be sequential.
   */
  async reconcile(data: ReconcileRequest): Promise<void> {
    const removedSet = new Set(data.removedIds);
    const removedTitleSet = new Set(data.removedTitleKeys);

    // 1. Create timestamped backup directory
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const backupDir = path.join(this.modPath, 'backups', `reconcile_${stamp}`);
    await fs.mkdir(backupDir, { recursive: true });

    // 2. Backup affected files
    const defPath = path.join(this.modPath, 'map_data', 'definition.csv');
    await this.backupFile(defPath, backupDir);
    await this.backupDirectory(path.join(this.modPath, 'history', 'provinces'), backupDir);
    await this.backupDirectory(path.join(this.modPath, 'common', 'landed_titles'), backupDir);
    const terrainFile = path.join(this.modPath, 'common', 'province_terrain', '00_province_terrain.txt');
    await this.backupFile(terrainFile, backupDir);
    await this.backupDirectory(path.join(this.modPath, 'gfx', 'map', 'map_object_data'), backupDir);
    const defaultMapFile = path.join(this.modPath, 'map_data', 'default.map');
    await this.backupFile(defaultMapFile, backupDir);

    // 3. Rewrite definition.csv with surviving renumbered provinces
    await writeDefinitionCsv(defPath, data.provinces);

    // 4. Clean up history files
    const histDir = path.join(this.modPath, 'history', 'provinces');
    await removeProvinceHistories(histDir, removedSet, data.idMap);

    // 5. Clean up landed_titles
    const titlesDir = path.join(this.modPath, 'common', 'landed_titles');
    await reconcileLandedTitles(titlesDir, removedSet, removedTitleSet, data.idMap);

    // 6. Clean up terrain
    await reconcileProvinceTerrain(this.modPath, removedSet, data.idMap);

    // 7. Clean up map object locator files (building positions, siege icons, etc.)
    await reconcileMapObjectLocators(this.modPath, removedSet, data.idMap);

    // 8. Clean up default.map (sea_zones, impassable_seas, rivers, lakes, mountains)
    await reconcileDefaultMap(this.modPath, removedSet, data.idMap);

    // 9. Update in-memory state
    this.provinces = data.provinces;
    this.landedTitles = await parseLandedTitles(titlesDir);
    this.titleIndex = buildTitleIndex(this.landedTitles);
  }

  /**
   * Verify the mod directory has the expected structure.
   */
  private async validateModDirectory(): Promise<void> {
    const required = [
      'map_data/definition.csv',
      'map_data/provinces.png',
    ];

    for (const rel of required) {
      const full = path.join(this.modPath, rel);
      try {
        await fs.access(full);
      } catch {
        throw new Error(`Required file not found: ${rel}\nIs this a valid CK3 mod directory?`);
      }
    }
  }

  /**
   * Copy a file to the backup directory if it exists.
   */
  private async backupFile(filePath: string, backupDir: string): Promise<void> {
    try {
      await fs.access(filePath);
      const relative = path.relative(this.modPath, filePath);
      const backupPath = path.join(backupDir, relative);
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.copyFile(filePath, backupPath);
    } catch {
      // File doesn't exist, nothing to back up
    }
  }

  /**
   * Copy all files in a directory to the backup directory.
   */
  private async backupDirectory(dirPath: string, backupDir: string): Promise<void> {
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        await this.backupFile(path.join(dirPath, file), backupDir);
      }
    } catch {
      // Directory doesn't exist, nothing to back up
    }
  }
}

/** Get appropriate indentation for a child entry under a given parent key */
function getChildIndent(parentKey: string): string {
  const tier = parentKey.substring(0, 2);
  switch (tier) {
    case 'e_': return '\t\t';      // empire child = kingdom depth
    case 'k_': return '\t\t\t';    // kingdom child = duchy depth
    case 'd_': return '\t\t\t\t';  // duchy child = county depth
    case 'c_': return '\t\t\t\t\t'; // county child = barony depth
    default: return '\t\t\t';
  }
}
