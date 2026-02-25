/**
 * Province Terrain — Read and write CK3 province terrain assignments.
 *
 * Terrain is defined in common/province_terrain/00_province_terrain.txt
 * with simple key=value format:
 *   8168 = forest
 *   8169 = hills
 *
 * One province ID per line. Comments (#) and blank lines are preserved.
 */

import fs from 'fs/promises';
import path from 'path';
import { ProvinceData } from '@shared/types';

/**
 * Parse the province terrain file and enrich province data.
 */
export async function parseProvinceTerrain(
  modPath: string,
  provinces: ProvinceData[]
): Promise<void> {
  const filePath = findTerrainFile(modPath);
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return; // File doesn't exist, no terrain data
  }

  const byId = new Map<number, ProvinceData>();
  for (const p of provinces) byId.set(p.id, p);

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;

    const idStr = trimmed.substring(0, eqIdx).trim();
    const terrain = trimmed.substring(eqIdx + 1).trim();

    const id = parseInt(idStr, 10);
    if (isNaN(id)) continue;

    const province = byId.get(id);
    if (province && terrain) {
      province.terrain = terrain;
    }
  }
}

/**
 * Save terrain data for modified provinces.
 * Non-destructive: reads the existing file, updates/appends entries.
 */
export async function saveProvinceTerrain(
  modPath: string,
  provinces: ProvinceData[],
  modifiedIds?: Set<number>
): Promise<void> {
  const filePath = findTerrainFile(modPath);
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });

  // Build map of provinces that have terrain set
  const terrainMap = new Map<number, string>();
  for (const p of provinces) {
    if (!p.terrain) continue;
    if (modifiedIds && !modifiedIds.has(p.id) && !p.isNew) continue;
    terrainMap.set(p.id, p.terrain);
  }

  if (terrainMap.size === 0) return;

  // Read existing file
  let lines: string[];
  let eol = '\n';
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    eol = content.includes('\r\n') ? '\r\n' : '\n';
    lines = content.split(/\r?\n/);
  } catch {
    lines = [];
  }

  // Update existing lines
  const updated = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;

    const id = parseInt(trimmed.substring(0, eqIdx).trim(), 10);
    if (isNaN(id)) continue;

    if (terrainMap.has(id)) {
      lines[i] = `${id} = ${terrainMap.get(id)}`;
      updated.add(id);
    }
  }

  // Append new entries
  for (const [id, terrain] of terrainMap) {
    if (!updated.has(id)) {
      lines.push(`${id} = ${terrain}`);
    }
  }

  await fs.writeFile(filePath, lines.join(eol), 'utf-8');
}

/**
 * Remove terrain entries for deleted provinces and remap remaining IDs.
 *
 * @param modPath - Mod root directory
 * @param removedIds - Province IDs to remove
 * @param idMap - Old ID → New ID for surviving provinces
 */
export async function reconcileProvinceTerrain(
  modPath: string,
  removedIds: Set<number>,
  idMap: Record<number, number>
): Promise<void> {
  const filePath = findTerrainFile(modPath);

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return; // File doesn't exist, nothing to reconcile
  }

  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Preserve comments and blank lines
    if (!trimmed || trimmed.startsWith('#')) {
      result.push(line);
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) {
      result.push(line);
      continue;
    }

    const id = parseInt(trimmed.substring(0, eqIdx).trim(), 10);
    if (isNaN(id)) {
      result.push(line);
      continue;
    }

    // Skip removed provinces
    if (removedIds.has(id)) continue;

    // Remap ID if needed
    const newId = idMap[id];
    if (newId !== undefined && newId !== id) {
      const terrain = trimmed.substring(eqIdx + 1).trim();
      result.push(`${newId} = ${terrain}`);
    } else {
      result.push(line);
    }
  }

  await fs.writeFile(filePath, result.join(eol), 'utf-8');
}

/** Resolve the terrain file path */
function findTerrainFile(modPath: string): string {
  return path.join(modPath, 'common', 'province_terrain', '00_province_terrain.txt');
}
