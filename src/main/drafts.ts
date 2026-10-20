/**
 * Drafts — Save and load draft state to/from VMP-Drafts/.
 *
 * A draft captures the current map image, province data, staged renames and pending state
 * without writing to actual mod files. Non-destructive snapshot.
 */

import fs from 'fs/promises';
import path from 'path';
import { loadPng, savePng } from './image-io';
import { parseDefinitionCsv, writeDefinitionCsv } from './modfiles/definition-csv';
import type { ProvinceData, DraftSaveData, DraftMetadata, DraftSummary } from '@shared/types';

const DRAFTS_DIR = 'VMP-Drafts';

/** Sanitize a user-provided name for use as a folder name */
function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'draft';
}

/** Generate a timestamp string for folder names (matches VMP-Backups pattern) */
function makeTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
}

/**
 * Save a draft: writes image, definitions and metadata only inside a unique VMP-Drafts subfolder
 */
export async function saveDraft(
  modPath: string,
  name: string,
  rgbaBuffer: Uint8Array,
  width: number,
  height: number,
  metadata: DraftSaveData,
): Promise<void> {
  const stamp = makeTimestamp();
  const folderName = `${sanitizeName(name)}_${stamp}`;
  const draftsRoot = path.join(modPath, DRAFTS_DIR);
  await fs.mkdir(draftsRoot, { recursive: true });
  // Separate versions even when two saves happen within the same second.
  const draftDir = await fs.mkdtemp(path.join(draftsRoot, `${folderName}_`));
  try {
    let diskDefinitions: ProvinceData[] = [];
    if (!metadata.provinces || metadata.sourceDefinitions === undefined) {
      try {
        diskDefinitions = await parseDefinitionCsv(path.join(modPath, 'map_data', 'definition.csv'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    const provinces = metadata.provinces ?? diskDefinitions;
    const fullMetadata: DraftMetadata = {
      ...metadata,
      name,
      timestamp: new Date().toISOString(),
      modPath,
      mapWidth: width,
      mapHeight: height,
      provinces,
      sourceDefinitions: metadata.sourceDefinitions === undefined ? diskDefinitions : metadata.sourceDefinitions,
    };
    await savePng(path.join(draftDir, 'provinces.png'), rgbaBuffer, width, height);
    await writeDefinitionCsv(path.join(draftDir, 'definition.csv'), provinces);
    // Publish metadata last; incomplete saves never appear in the draft picker.
    await fs.writeFile(path.join(draftDir, 'draft.json'), JSON.stringify(fullMetadata, null, 2), 'utf-8');
  } catch (error) {
    await fs.rm(draftDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * List all drafts for a mod directory.
 * Returns summaries sorted by timestamp (newest first).
 */
export async function listDrafts(modPath: string): Promise<DraftSummary[]> {
  const draftsDir = path.join(modPath, DRAFTS_DIR);

  try {
    await fs.access(draftsDir);
  } catch {
    return [];
  }

  const entries = await fs.readdir(draftsDir, { withFileTypes: true });
  const summaries: DraftSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const jsonPath = path.join(draftsDir, entry.name, 'draft.json');
    try {
      const raw = await fs.readFile(jsonPath, 'utf-8');
      const meta: DraftMetadata = JSON.parse(raw);
      summaries.push({
        name: meta.name,
        timestamp: meta.timestamp,
        folderName: entry.name,
      });
    } catch {
      // Skip malformed draft folders
      continue;
    }
  }

  summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return summaries;
}

/**
 * Load a draft's PNG image.
 * Returns RGBA buffer + dimensions (same shape as loadPng).
 */
export async function loadDraftImage(
  modPath: string,
  folderName: string,
): Promise<{ buffer: Uint8Array; width: number; height: number }> {
  const pngPath = path.join(modPath, DRAFTS_DIR, folderName, 'provinces.png');
  return await loadPng(pngPath);
}

/**
 * Load a draft's metadata JSON.
 */
export async function loadDraftMetadata(
  modPath: string,
  folderName: string,
): Promise<DraftMetadata> {
  const jsonPath = path.join(modPath, DRAFTS_DIR, folderName, 'draft.json');
  const raw = await fs.readFile(jsonPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Delete a draft folder.
 */
export async function deleteDraft(
  modPath: string,
  folderName: string,
): Promise<void> {
  const draftDir = path.join(modPath, DRAFTS_DIR, folderName);
  await fs.rm(draftDir, { recursive: true, force: true });
}

// Re-export sanitizeName for testing
export { sanitizeName as _sanitizeName };
