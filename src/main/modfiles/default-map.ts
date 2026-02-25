/**
 * default.map — Reconcile CK3 map data province ID references.
 *
 * default.map contains province ID references in RANGE and LIST entries
 * for sea_zones, impassable_seas, river_provinces, lakes, and
 * impassable_mountains. When provinces are removed and IDs renumbered,
 * all these references must be updated.
 *
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Reconcile province ID references in default.map after removal/renumbering.
 *
 * Updates RANGE and LIST entries for:
 * - sea_zones
 * - impassable_seas
 * - river_provinces
 * - lakes
 * - impassable_mountains
 *
 * Removed IDs are excluded from lists/ranges. Surviving IDs are remapped.
 * Ranges that become empty are removed entirely. Ranges where the
 * remapped IDs are no longer contiguous are split or converted to LISTs.
 *
 * @param modPath - Mod root directory
 * @param removedIds - Province IDs to remove
 * @param idMap - Old ID → New ID for surviving provinces
 */
export async function reconcileDefaultMap(
  modPath: string,
  removedIds: Set<number>,
  idMap: Record<number, number>
): Promise<void> {
  const filePath = path.join(modPath, 'map_data', 'default.map');

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return; // File doesn't exist
  }

  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const result: string[] = [];
  let modified = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match RANGE lines: key = RANGE { start end }
    const rangeMatch = trimmed.match(
      /^(\w+)\s*=\s*RANGE\s*\{\s*(\d+)\s+(\d+)\s*\}$/
    );
    if (rangeMatch) {
      const key = rangeMatch[1];
      const rangeStart = parseInt(rangeMatch[2], 10);
      const rangeEnd = parseInt(rangeMatch[3], 10);

      // Expand range, filter removed, remap surviving IDs
      const remapped = remapRange(rangeStart, rangeEnd, removedIds, idMap);

      if (remapped.length === 0) {
        // Entire range was removed — skip this line
        modified = true;
        continue;
      }

      // Re-encode as contiguous RANGE entries
      const indent = line.match(/^(\s*)/)?.[1] ?? '';
      const newLines = encodeAsRanges(key, remapped, indent);

      // Check if output differs from original
      if (newLines.length !== 1 || newLines[0] !== line) {
        modified = true;
      }
      result.push(...newLines);
      continue;
    }

    // Match LIST lines: key = LIST { id1 id2 id3 ... }
    const listMatch = trimmed.match(
      /^(\w+)\s*=\s*LIST\s*\{\s*([\d\s]+)\s*\}$/
    );
    if (listMatch) {
      const key = listMatch[1];
      const ids = listMatch[2].trim().split(/\s+/).map(s => parseInt(s, 10));

      // Filter removed, remap surviving
      const remapped: number[] = [];
      for (const id of ids) {
        if (removedIds.has(id)) continue;
        const newId = idMap[id];
        remapped.push(newId !== undefined ? newId : id);
      }

      if (remapped.length === 0) {
        modified = true;
        continue;
      }

      remapped.sort((a, b) => a - b);
      const indent = line.match(/^(\s*)/)?.[1] ?? '';
      const newLine = `${indent}${key} = LIST { ${remapped.join(' ')} }`;

      if (newLine !== line) modified = true;
      result.push(newLine);
      continue;
    }

    // Non-matching lines pass through unchanged
    result.push(line);
  }

  if (modified) {
    await fs.writeFile(filePath, result.join(eol), 'utf-8');
  }
}

/**
 * Expand a numeric range, filter out removed IDs, remap surviving IDs,
 * and return sorted array of new IDs.
 */
function remapRange(
  start: number,
  end: number,
  removedIds: Set<number>,
  idMap: Record<number, number>
): number[] {
  const result: number[] = [];
  for (let id = start; id <= end; id++) {
    if (removedIds.has(id)) continue;
    const newId = idMap[id];
    result.push(newId !== undefined ? newId : id);
  }
  result.sort((a, b) => a - b);
  return result;
}

/**
 * Encode a sorted array of IDs as one or more RANGE lines.
 * Consecutive runs become RANGE entries; isolated IDs also become
 * single-element ranges (RANGE { N N }).
 */
function encodeAsRanges(
  key: string,
  ids: number[],
  indent: string
): string[] {
  const lines: string[] = [];
  let i = 0;
  while (i < ids.length) {
    const runStart = ids[i];
    let runEnd = runStart;
    while (i + 1 < ids.length && ids[i + 1] === runEnd + 1) {
      i++;
      runEnd = ids[i];
    }
    lines.push(`${indent}${key} = RANGE { ${runStart} ${runEnd} }`);
    i++;
  }
  return lines;
}
