/**
 * History Provinces — Parse and generate CK3 province history files.
 *
 * Multiple provinces per file, with optional date-stamped override entries.
 */

import { ProvinceData, ProvinceDateEntry } from '@shared/types';
import { parseParadoxScript, serializeParadoxScript, ParadoxNode } from './paradox-parser';
import fs from 'fs/promises';
import path from 'path';

/** Date pattern: digits.digits.digits */
const DATE_PATTERN = /^\d+\.\d+\.\d+$/;

/** Province ID pattern: purely numeric key */
const PROVINCE_ID_PATTERN = /^\d+$/;

/**
 * Extract base key-value fields and date entries from a province block's children.
 */
function extractProvinceFields(children: ParadoxNode[]): {
  base: Record<string, string>;
  dateEntries: ProvinceDateEntry[];
} {
  const base: Record<string, string> = {};
  const dateEntries: ProvinceDateEntry[] = [];

  for (const child of children) {
    if (!child.key) continue;

    if (child.type === 'value' && child.value !== undefined) {
      // Simple key = value (strip inline comments)
      let val = child.value;
      const commentIdx = val.indexOf('#');
      if (commentIdx >= 0) val = val.substring(0, commentIdx).trim();
      base[child.key] = val;
    } else if (child.type === 'block' && child.children && DATE_PATTERN.test(child.key)) {
      // Date entry: 7824.1.1 = { ... }
      const overrides: Record<string, string> = {};
      const rawBlocks: Record<string, string> = {};

      for (const dateChild of child.children) {
        if (!dateChild.key) continue;
        if (dateChild.type === 'value' && dateChild.value !== undefined) {
          overrides[dateChild.key] = dateChild.value;
        } else if (dateChild.type === 'block') {
          // Preserve nested blocks (like buildings) as raw serialized text
          rawBlocks[dateChild.key] = serializeParadoxScript([dateChild], 0);
        }
      }

      dateEntries.push({
        date: child.key,
        overrides,
        rawBlocks: Object.keys(rawBlocks).length > 0 ? rawBlocks : undefined,
      });
    }
    // Skip other nested blocks we don't understand
  }

  return { base, dateEntries };
}

/**
 * Parse all province history files in the directory.
 * Handles any file naming convention — scans all .txt files and looks for
 * numeric-keyed blocks (province IDs).
 */
export async function parseProvinceHistories(
  dirPath: string,
  provinces: ProvinceData[]
): Promise<ProvinceData[]> {
  const byId = new Map<number, ProvinceData>();
  for (const p of provinces) byId.set(p.id, p);

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch {
    return provinces;
  }

  for (const file of files) {
    if (!file.endsWith('.txt')) continue;

    try {
      const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
      const ast = parseParadoxScript(content);

      for (const node of ast) {
        // Only process numeric keys (province IDs)
        if (!node.key || !PROVINCE_ID_PATTERN.test(node.key)) continue;

        const id = parseInt(node.key, 10);
        const province = byId.get(id);
        if (!province) continue;

        province.historyFile = file;

        if (node.type === 'block' && node.children) {
          const { base, dateEntries } = extractProvinceFields(node.children);

          if (base.culture) province.culture = base.culture;
          if (base.religion) province.religion = base.religion;
          if (base.holding) province.holding = base.holding;

          if (dateEntries.length > 0) {
            province.dateEntries = dateEntries;
          }
        } else if (node.type === 'value' && node.value) {
          // Unlikely but handle: bare value after province ID
        }
      }
    } catch (err) {
      console.warn(`Failed to parse province history file ${file}:`, err);
    }
  }

  return provinces;
}

/**
 * Save a province's base fields back to its history file.
 * Non-destructive: only modifies the specific province block's key=value lines.
 * Date entries and other provinces in the file are untouched.
 */
export async function saveProvinceHistory(
  dirPath: string,
  province: ProvinceData
): Promise<void> {
  if (!province.historyFile) {
    // New province with no existing file — generate a standalone stub
    await generateProvinceStub(dirPath, province);
    return;
  }

  const filePath = path.join(dirPath, province.historyFile);
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    await generateProvinceStub(dirPath, province);
    return;
  }

  // Find the province block in the file and update its fields
  content = updateProvinceBlock(content, province);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Find a province ID's block in raw file text and update its base fields.
 * Preserves everything else: comments, whitespace, date entries, other provinces.
 */
function updateProvinceBlock(content: string, province: ProvinceData): string {
  const lines = content.split(/\r?\n/);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const idStr = String(province.id);

  // Find the line that starts this province block
  // Matches: "8846 = {" or "8846={" or "8846 = { holding = none }"
  const blockStartPattern = new RegExp(`^(\\s*)${idStr}\\s*=\\s*\\{`);

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(blockStartPattern);
    if (!match) continue;

    const indent = match[1];

    // Check if it's a single-line block: "8846 = { holding = none }"
    if (lines[i].includes('}')) {
      // Replace the whole line with expanded block
      lines[i] = buildProvinceBlock(idStr, province, indent);
      return lines.join(eol);
    }

    // Multi-line block: find its closing brace and update fields within
    let depth = 0;
    let blockEnd = -1;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) {
            blockEnd = j;
            break;
          }
        }
      }
      if (blockEnd >= 0) break;
    }

    if (blockEnd < 0) break; // malformed, don't touch

    // Update key=value lines within the block (lines i+1 to blockEnd-1)
    const fieldIndent = indent + '\t';
    const fieldsToSet: Record<string, string> = {};
    if (province.culture !== undefined) fieldsToSet['culture'] = province.culture;
    if (province.religion !== undefined) fieldsToSet['religion'] = province.religion;
    if (province.holding !== undefined) fieldsToSet['holding'] = province.holding;

    const setFields = new Set<string>();
    for (let j = i + 1; j < blockEnd; j++) {
      const trimmed = lines[j].trim();
      // Skip date blocks, comments, empty lines
      if (!trimmed || trimmed.startsWith('#') || DATE_PATTERN.test(trimmed.split(/\s/)[0])) continue;
      if (trimmed === '{' || trimmed === '}') continue;

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        if (key in fieldsToSet) {
          lines[j] = `${fieldIndent}${key} = ${fieldsToSet[key]}`;
          setFields.add(key);
        }
      }
    }

    // Append any fields that weren't found in existing lines
    const insertLines: string[] = [];
    for (const [key, value] of Object.entries(fieldsToSet)) {
      if (!setFields.has(key) && value) {
        insertLines.push(`${fieldIndent}${key} = ${value}`);
      }
    }
    if (insertLines.length > 0) {
      // Insert after the opening brace line (i)
      lines.splice(i + 1, 0, ...insertLines);
    }

    return lines.join(eol);
  }

  // Province block not found in file — append it
  const newBlock = buildProvinceBlock(idStr, province, '');
  return content + eol + newBlock + eol;
}

/** Build a province block string */
function buildProvinceBlock(idStr: string, province: ProvinceData, indent: string): string {
  const fi = indent + '\t';
  const parts: string[] = [`${indent}${idStr} = {`];
  if (province.culture) parts.push(`${fi}culture = ${province.culture}`);
  if (province.religion) parts.push(`${fi}religion = ${province.religion}`);
  if (province.holding) parts.push(`${fi}holding = ${province.holding}`);
  parts.push(`${indent}}`);
  return parts.join('\n');
}

/**
 * Generate a standalone stub file for a new province.
 * Used when there's no existing history file to append to.
 */
export async function generateProvinceStub(
  dirPath: string,
  province: ProvinceData
): Promise<void> {
  // Use historyFile if set, otherwise generate a filename
  const filename = province.historyFile || `${province.id} - ${province.name}.txt`;
  const filePath = path.join(dirPath, filename);

  // If file exists, try to append to it rather than overwrite
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    // Check if this province ID already exists
    const pattern = new RegExp(`^\\s*${province.id}\\s*=`, 'm');
    if (!pattern.test(content)) {
      content += eol + buildProvinceBlock(String(province.id), province, '') + eol;
      await fs.writeFile(filePath, content, 'utf-8');
    }
    return;
  } catch {
    // File doesn't exist
  }

  await fs.mkdir(dirPath, { recursive: true });
  const content = buildProvinceBlock(String(province.id), province, '');
  await fs.writeFile(filePath, content, 'utf-8');
}
