/**
 * Landed Titles — Parse and write CK3 landed_titles files.
 *
 * Reads the title hierarchy tree from common/landed_titles/*.txt.
 * Provides methods to look up titles, insert new ones, and write
 * modifications back non-destructively.
 */

import { LandedTitleNode, RGB } from '@shared/types';
import { parseParadoxScript, ParadoxNode } from './paradox-parser';
import fs from 'fs/promises';
import path from 'path';

/** Title tier inferred from the key prefix */
function inferTier(key: string): 'b' | 'c' | 'd' | 'k' | 'e' {
  if (key.startsWith('b_')) return 'b';
  if (key.startsWith('c_')) return 'c';
  if (key.startsWith('d_')) return 'd';
  if (key.startsWith('k_')) return 'k';
  if (key.startsWith('e_')) return 'e';
  return 'b'; // fallback
}

/** Extract RGB from a color block node: color = { r g b } */
function extractColor(node: ParadoxNode): RGB | undefined {
  if (node.type !== 'block' || !node.children) return undefined;
  const vals = node.children.filter(c => c.type === 'value' && !c.key);
  if (vals.length >= 3) {
    const r = parseInt(vals[0].value || '0', 10);
    const g = parseInt(vals[1].value || '0', 10);
    const b = parseInt(vals[2].value || '0', 10);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return { r, g, b };
  }
  return undefined;
}

/**
 * Convert a ParadoxNode tree into a LandedTitleNode tree.
 * Only processes nodes whose key starts with a title prefix (e_, k_, d_, c_, b_).
 */
function paradoxToTitle(node: ParadoxNode): LandedTitleNode | null {
  if (!node.key || node.type !== 'block') return null;

  // Only process title-prefixed keys
  if (!node.key.match(/^[ekdcb]_/)) return null;

  const result: LandedTitleNode = {
    key: node.key,
    tier: inferTier(node.key),
    children: [],
  };

  if (!node.children) return result;

  for (const child of node.children) {
    if (child.key === 'color' && child.type === 'block') {
      result.color = extractColor(child);
    } else if (child.key === 'province' && child.type === 'value') {
      result.provinceId = parseInt(child.value || '0', 10);
    } else if (child.type === 'block' && child.key?.match(/^[ekdcb]_/)) {
      const childTitle = paradoxToTitle(child);
      if (childTitle) result.children.push(childTitle);
    }
  }

  return result;
}

/**
 * Parse all landed_titles files in the given directory.
 * Returns a flat array of top-level title trees.
 */
export async function parseLandedTitles(dirPath: string): Promise<LandedTitleNode[]> {
  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch {
    return [];
  }

  const titles: LandedTitleNode[] = [];

  for (const file of files) {
    if (!file.endsWith('.txt')) continue;

    try {
      const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
      const ast = parseParadoxScript(content);

      for (const node of ast) {
        const title = paradoxToTitle(node);
        if (title) titles.push(title);
      }
    } catch {
      // Skip unparseable files
    }
  }

  return titles;
}

/**
 * Build lookup indices from the title tree.
 */
export interface TitleIndex {
  /** Title key -> LandedTitleNode */
  byKey: Map<string, LandedTitleNode>;
  /** Province ID -> barony LandedTitleNode */
  byProvinceId: Map<number, LandedTitleNode>;
  /** Title key -> parent title key */
  parentOf: Map<string, string>;
}

export function buildTitleIndex(titles: LandedTitleNode[]): TitleIndex {
  const byKey = new Map<string, LandedTitleNode>();
  const byProvinceId = new Map<number, LandedTitleNode>();
  const parentOf = new Map<string, string>();

  function walk(node: LandedTitleNode, parentKey?: string): void {
    byKey.set(node.key, node);
    if (parentKey) parentOf.set(node.key, parentKey);
    if (node.provinceId !== undefined) {
      byProvinceId.set(node.provinceId, node);
    }
    for (const child of node.children) {
      walk(child, node.key);
    }
  }

  for (const t of titles) walk(t);

  return { byKey, byProvinceId, parentOf };
}

/**
 * Resolve the de jure hierarchy for a province ID.
 * Returns an array from barony up to empire: [b_, c_, d_, k_, e_]
 */
export function resolveHierarchy(
  provinceId: number,
  index: TitleIndex
): LandedTitleNode[] {
  const barony = index.byProvinceId.get(provinceId);
  if (!barony) return [];

  const chain: LandedTitleNode[] = [barony];
  let current = barony.key;

  while (index.parentOf.has(current)) {
    const parentKey = index.parentOf.get(current)!;
    const parent = index.byKey.get(parentKey);
    if (!parent) break;
    chain.push(parent);
    current = parentKey;
  }

  return chain;
}

/**
 * Insert a new title node into the tree under the specified parent.
 * Returns true if parent was found and child was inserted.
 */
export function insertTitle(
  tree: LandedTitleNode[],
  parentKey: string,
  newTitle: LandedTitleNode
): boolean {
  for (const node of tree) {
    if (node.key === parentKey) {
      node.children.push(newTitle);
      return true;
    }
    if (insertTitle(node.children, parentKey, newTitle)) {
      return true;
    }
  }
  return false;
}

/**
 * Append a title entry to an existing landed_titles file.
 * Inserts before the last closing brace of the specified parent block.
 * Non-destructive: preserves all existing content.
 */
export async function appendToTitleFile(
  filePath: string,
  parentKey: string,
  entryText: string
): Promise<boolean> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return false;
  }

  // Find the parent block and its opening brace
  const parentPattern = new RegExp(`^([ \\t]*${escapeRegex(parentKey)}\\s*=\\s*\\{)`, 'm');
  const match = content.match(parentPattern);
  if (!match || match.index === undefined) return false;

  // Find the matching closing brace by counting braces
  let depth = 0;
  let insertPos = -1;
  const startIdx = match.index + match[1].length;

  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    if (content[i] === '}') {
      if (depth === 0) {
        insertPos = i;
        break;
      }
      depth--;
    }
  }

  if (insertPos < 0) return false;

  // Insert before the closing brace, preserving indentation
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const rawBefore = content.substring(0, insertPos);
  const closingIndent = rawBefore.match(/[ \t]*$/)?.[0] ?? '';
  const before = rawBefore.substring(0, rawBefore.length - closingIndent.length);
  const after = content.substring(insertPos);
  const newContent = before + eol + entryText + eol + closingIndent + after;

  await fs.writeFile(filePath, newContent, 'utf-8');
  return true;
}

/**
 * Generate a barony block for insertion into a county.
 */
export function generateBaronyBlock(key: string, provinceId: number, indent: string): string {
  return `${indent}${key} = {\n${indent}\tprovince = ${provinceId}\n${indent}}`;
}

/**
 * Generate a full county stub with a barony inside.
 */
export function generateCountyStub(
  countyKey: string,
  baronyKey: string,
  provinceId: number,
  color?: RGB,
  indent: string = '\t\t'
): string {
  const colorLine = color ? `\n${indent}\tcolor = { ${color.r} ${color.g} ${color.b} }` : '';
  return `${indent}${countyKey} = {${colorLine}\n${indent}\t${baronyKey} = {\n${indent}\t\tprovince = ${provinceId}\n${indent}\t}\n${indent}}`;
}

/**
 * Rename a title key in all landed_titles files.
 * Replaces occurrences of oldKey with newKey in the raw file text.
 * Returns true if the key was found and replaced.
 */
export async function renameTitleInFile(
  dirPath: string,
  oldKey: string,
  newKey: string
): Promise<boolean> {
  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch {
    return false;
  }

  for (const file of files) {
    if (!file.endsWith('.txt')) continue;
    const filePath = path.join(dirPath, file);
    const content = await fs.readFile(filePath, 'utf-8');

    // Match the key as a whole word (title key followed by whitespace or =)
    const pattern = new RegExp(`\\b${escapeRegex(oldKey)}\\b`, 'g');
    if (!pattern.test(content)) continue;

    const updated = content.replace(pattern, newKey);
    await fs.writeFile(filePath, updated, 'utf-8');
    return true;
  }

  return false;
}

/**
 * Reconcile landed_titles files after province removal.
 *
 * 1. Remove barony blocks whose `province = X` matches a removed ID.
 * 2. Remove parent title blocks the user confirmed for removal.
 * 3. Remap remaining `province = oldId` references to new IDs.
 *
 * Preserves all comments, whitespace, and formatting.
 *
 * @param dirPath - common/landed_titles directory
 * @param removedIds - Province IDs whose baronies should be removed
 * @param removedTitleKeys - Parent title keys to also remove (user-confirmed)
 * @param idMap - Old ID → New ID for surviving provinces
 */
export async function reconcileLandedTitles(
  dirPath: string,
  removedIds: Set<number>,
  removedTitleKeys: Set<string>,
  idMap: Record<number, number>
): Promise<void> {
  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith('.txt')) continue;
    const filePath = path.join(dirPath, file);

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    let modified = false;

    // Phase A: Find and remove blocks
    // First, find barony blocks with province = removedId
    const blocksToRemove = findBlocksToRemove(content, removedIds, removedTitleKeys);

    if (blocksToRemove.length > 0) {
      // Remove from bottom to top to preserve character offsets
      const sorted = [...blocksToRemove].sort((a, b) => b.start - a.start);
      for (const range of sorted) {
        content = content.substring(0, range.start) + content.substring(range.end);
      }
      modified = true;
    }

    // Phase B: Remap province IDs
    const remapped = content.replace(
      /(\bprovince\s*=\s*)(\d+)/g,
      (_match, prefix: string, idStr: string) => {
        const oldId = parseInt(idStr, 10);
        const newId = idMap[oldId];
        if (newId !== undefined && newId !== oldId) {
          modified = true;
          return `${prefix}${newId}`;
        }
        return `${prefix}${idStr}`;
      }
    );

    if (modified) {
      await fs.writeFile(filePath, remapped, 'utf-8');
    }
  }
}

/**
 * Find character ranges of blocks to remove from landed_titles content.
 * Merges overlapping ranges (e.g. a parent title containing a child barony).
 */
function findBlocksToRemove(
  content: string,
  removedIds: Set<number>,
  removedTitleKeys: Set<string>
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];

  // First, find explicitly-confirmed parent title blocks (these may contain baronies)
  for (const titleKey of removedTitleKeys) {
    const titlePattern = new RegExp(`^[ \\t]*${escapeRegex(titleKey)}\\s*=\\s*\\{`, 'm');
    const titleMatch = content.match(titlePattern);
    if (!titleMatch || titleMatch.index === undefined) continue;

    let start = titleMatch.index;
    const blockEnd = findBlockEnd(content, start + titleMatch[0].indexOf('{'));
    if (blockEnd < 0) continue;

    let end = blockEnd;
    if (content[end] === '\n') end++;
    else if (content[end] === '\r' && content[end + 1] === '\n') end += 2;

    while (start > 0 && content[start - 1] !== '\n' && content[start - 1] !== '\r') {
      start--;
    }

    ranges.push({ start, end });
  }

  // Then, find barony blocks with province = <removedId>
  const provincePattern = /\bprovince\s*=\s*(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = provincePattern.exec(content)) !== null) {
    const id = parseInt(match[1], 10);
    if (!removedIds.has(id)) continue;

    // Check if this position is already inside a range being removed
    const alreadyCovered = ranges.some(r => match!.index >= r.start && match!.index < r.end);
    if (alreadyCovered) continue;

    const baronyStart = findEnclosingBlockStart(content, match.index);
    if (baronyStart < 0) continue;

    const baronyEnd = findBlockEnd(content, baronyStart);
    if (baronyEnd < 0) continue;

    let end = baronyEnd;
    if (content[end] === '\n') end++;
    else if (content[end] === '\r' && content[end + 1] === '\n') end += 2;

    let start = baronyStart;
    while (start > 0 && content[start - 1] !== '\n' && content[start - 1] !== '\r') {
      start--;
    }

    ranges.push({ start, end });
  }

  return ranges;
}

/**
 * Walk backward from a position to find the start of the enclosing b_ block.
 * Looks for a line matching `b_xxx = {` before the given position.
 */
function findEnclosingBlockStart(content: string, pos: number): number {
  // Walk backward line by line
  let i = pos;
  while (i > 0) {
    // Find start of current line
    let lineStart = i;
    while (lineStart > 0 && content[lineStart - 1] !== '\n') lineStart--;

    const line = content.substring(lineStart, i + 1);
    const match = line.match(/^\s*b_\w+\s*=\s*\{/);
    if (match) {
      return lineStart;
    }

    i = lineStart - 1;
    if (i < 0) break;
  }
  return -1;
}

/**
 * From a position at or before an opening `{`, find the matching closing `}`.
 * Returns the position immediately AFTER the closing brace.
 */
function findBlockEnd(content: string, startPos: number): number {
  // Find the first { from startPos
  let i = startPos;
  while (i < content.length && content[i] !== '{') i++;
  if (i >= content.length) return -1;

  let depth = 0;
  for (; i < content.length; i++) {
    if (content[i] === '{') depth++;
    if (content[i] === '}') {
      depth--;
      if (depth === 0) return i + 1; // position after the }
    }
  }
  return -1;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
