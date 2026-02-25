/**
 * Reconciliation Logic — Pure functions for detecting orphaned provinces
 * and building ID remaps.
 *
 * Runs in the renderer process before save. Compares the ColorRegistry
 * against the set of colors actually painted on the map to find provinces
 * that no longer have any pixels.
 */

import { ProvinceData, LandedTitleNode, rgbToKey } from '@shared/types';

/** A parent title that would become empty after barony removals */
export interface OrphanedParent {
  /** Title key, e.g. "c_london" */
  key: string;
  /** Title tier */
  tier: 'c' | 'd' | 'k' | 'e';
  /** Total baronies currently under this title (directly or nested) */
  totalBaronies: number;
  /** How many of those baronies are being removed */
  removedBaronies: number;
}

/** Result of the orphan detection scan */
export interface OrphanScanResult {
  /** Provinces registered but not present on the map */
  orphanedProvinces: ProvinceData[];
  /** Parent titles that would become empty if all orphaned baronies are removed */
  orphanedParents: OrphanedParent[];
}

/**
 * Detect orphaned provinces by comparing the registry against colors on the map.
 *
 * @param allProvinces - All provinces currently in the registry
 * @param usedColors - Set of rgbToKey strings found on the map (excluding empty colors)
 * @param landedTitles - The landed title tree for parent orphan detection
 */
export function detectOrphans(
  allProvinces: ProvinceData[],
  usedColors: Set<string>,
  landedTitles: LandedTitleNode[]
): OrphanScanResult {
  const orphanedProvinces: ProvinceData[] = [];

  for (const province of allProvinces) {
    const key = rgbToKey(province.color);
    if (!usedColors.has(key)) {
      orphanedProvinces.push(province);
    }
  }

  const removedIds = new Set(orphanedProvinces.map(p => p.id));
  const orphanedParents = detectOrphanedParents(landedTitles, removedIds);

  return { orphanedProvinces, orphanedParents };
}

/**
 * Build a sequential ID remap for surviving provinces.
 * Assigns new IDs starting from 1, preserving the original sort order.
 *
 * @param allProvinces - All provinces (including ones to be removed)
 * @param removedIds - Set of province IDs being removed
 * @returns Map from old ID to new sequential ID
 */
export function buildIdRemap(
  allProvinces: ProvinceData[],
  removedIds: Set<number>
): Map<number, number> {
  const surviving = allProvinces
    .filter(p => !removedIds.has(p.id))
    .sort((a, b) => a.id - b.id);

  const idMap = new Map<number, number>();
  let newId = 1;
  for (const province of surviving) {
    idMap.set(province.id, newId);
    newId++;
  }

  return idMap;
}

/**
 * Detect parent titles that would become empty after barony removals.
 * Recursively walks the title tree to find counties, duchies, kingdoms,
 * and empires where ALL baronies (direct or nested) are being removed.
 */
export function detectOrphanedParents(
  landedTitles: LandedTitleNode[],
  removedIds: Set<number>
): OrphanedParent[] {
  const orphaned: OrphanedParent[] = [];

  function countBaronies(node: LandedTitleNode): { total: number; removed: number } {
    let total = 0;
    let removed = 0;

    if (node.tier === 'b' && node.provinceId !== undefined) {
      total = 1;
      removed = removedIds.has(node.provinceId) ? 1 : 0;
      return { total, removed };
    }

    for (const child of node.children) {
      const childCounts = countBaronies(child);
      total += childCounts.total;
      removed += childCounts.removed;
    }

    return { total, removed };
  }

  function walk(nodes: LandedTitleNode[]): void {
    for (const node of nodes) {
      // Only check county-level and above for orphaning
      if (node.tier !== 'b') {
        const { total, removed } = countBaronies(node);
        if (total > 0 && total === removed) {
          orphaned.push({
            key: node.key,
            tier: node.tier as 'c' | 'd' | 'k' | 'e',
            totalBaronies: total,
            removedBaronies: removed,
          });
        } else {
          // Only recurse into children if this node isn't fully orphaned
          // (if it is, no need to report its children separately)
          walk(node.children);
        }
      }
    }
  }

  walk(landedTitles);
  return orphaned;
}
