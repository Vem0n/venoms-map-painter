/**
 * Map Object Locators — Reconcile CK3 locator files in gfx/map/map_object_data/.
 *
 * These files contain province-keyed 3D positions for buildings, siege icons,
 * combat markers, etc. Each "instance" block has an `id=N` referencing a
 * province ID with associated position, rotation, and scale.
 *
 */

import fs from 'fs/promises';
import path from 'path';

/** Filenames known to contain province ID references */
const LOCATOR_FILES = [
  'building_locators.txt',
  'siege_locators.txt',
  'activities.txt',
  'special_building_locators.txt',
  'combat_locators.txt',
  'player_stack_locators.txt',
];

/**
 * Reconcile map object locator files after province removal/renumbering.
 *
 * For each locator file:
 * 1. Remove instance blocks whose `id=` matches a removed province ID.
 * 2. Remap `id=oldId` to `id=newId` for surviving provinces.
 *
 * @param modPath - Mod root directory
 * @param removedIds - Province IDs to remove
 * @param idMap - Old ID → New ID for surviving provinces
 */
export async function reconcileMapObjectLocators(
  modPath: string,
  removedIds: Set<number>,
  idMap: Record<number, number>
): Promise<void> {
  const locatorDir = path.join(modPath, 'gfx', 'map', 'map_object_data');

  for (const filename of LOCATOR_FILES) {
    const filePath = path.join(locatorDir, filename);

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue; // File doesn't exist in this mod
    }

    // Line-based approach: split into lines, process instance blocks as groups.
    // Instance blocks inside instances={ } look like:
    //   \t\t{
    //   \t\t\tid=42
    //   \t\t\tposition={ x y z }
    //   \t\t\trotation={ x y z w }
    //   \t\t\tscale={ x y z }
    //   \t\t}
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r?\n/);
    const result: string[] = [];
    let modified = false;

    let i = 0;
    while (i < lines.length) {
      const trimmed = lines[i].trim();

      // Check if this line is a lone opening brace (start of an instance block)
      // We peek ahead to see if the next non-empty line has id=N
      if (trimmed === '{') {
        const blockId = peekInstanceId(lines, i + 1);
        if (blockId !== null) {
          // This is an instance block. Find its closing brace.
          const closeIdx = findBlockClose(lines, i);
          if (closeIdx >= 0) {
            if (removedIds.has(blockId)) {
              // Skip this entire block (lines i through closeIdx inclusive)
              modified = true;
              i = closeIdx + 1;
              continue;
            }

            // Check if this ID needs remapping
            const newId = idMap[blockId];
            if (newId !== undefined && newId !== blockId) {
              // Copy the block but remap the id= line
              for (let j = i; j <= closeIdx; j++) {
                const lineMatch = lines[j].match(/^(\s*)id=(\d+)(.*)$/);
                if (lineMatch && parseInt(lineMatch[2], 10) === blockId) {
                  result.push(`${lineMatch[1]}id=${newId}${lineMatch[3]}`);
                  modified = true;
                } else {
                  result.push(lines[j]);
                }
              }
              i = closeIdx + 1;
              continue;
            }
          }
        }
      }

      result.push(lines[i]);
      i++;
    }

    if (modified) {
      await fs.writeFile(filePath, result.join(eol), 'utf-8');
    }
  }
}

/**
 * Peek ahead from line index to find an id=N value.
 * Returns the numeric ID if found within the next few lines, or null.
 */
function peekInstanceId(lines: string[], startIdx: number): number | null {
  // The id= line should be the first content line after the opening {
  for (let i = startIdx; i < lines.length && i < startIdx + 3; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue; // skip blank lines
    const match = trimmed.match(/^id=(\d+)$/);
    if (match) return parseInt(match[1], 10);
    // If we hit something that's not id=, this isn't an instance block pattern
    return null;
  }
  return null;
}

/**
 * From a line containing `{`, find the line with the matching `}`.
 * Uses brace-depth counting across lines.
 */
function findBlockClose(lines: string[], startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}
