import type { LandedTitleNode, ProvinceData } from './types';

export type TitleRename = { oldKey: string; newKey: string };

/** Apply staged renames to a tree without touching mod files. */
export function renameTitleTree(titles: LandedTitleNode[], renames: TitleRename[]): LandedTitleNode[] {
  return titles.map(node => ({
    ...node,
    key: renames.reduce((key, rename) => key === rename.oldKey ? rename.newKey : key, node.key),
    children: renameTitleTree(node.children, renames),
  }));
}

/** Translate a displayed title key back to its current disk key. */
export function diskTitleKey(key: string, renames: TitleRename[]): string {
  return [...renames].reverse().reduce((value, rename) => value === rename.newKey ? rename.oldKey : value, key);
}

/** Parent deletion is valid only if all descendant provinces are being removed. */
export function removableTitleKeys(titles: LandedTitleNode[], removedIds: Set<number>): Set<string> {
  const keys = new Set<string>();
  const visit = (node: LandedTitleNode): number[] => {
    const ids = node.tier === 'b' && node.provinceId !== undefined
      ? [node.provinceId] : node.children.flatMap(visit);
    if (node.tier !== 'b' && ids.length > 0 && ids.every(id => removedIds.has(id))) keys.add(node.key);
    return ids;
  };
  titles.forEach(visit);
  return keys;
}

/** Compare identities, colors, and names, independently of file formatting/order. */
export function definitionDifferences(baseline: ProvinceData[], disk: ProvinceData[]): string[] {
  const before = new Map(baseline.map(p => [p.id, p]));
  const after = new Map(disk.map(p => [p.id, p]));
  const differences: string[] = [];
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b)) {
    const old = before.get(id);
    const current = after.get(id);
    if (!old) differences.push(`#${id} ${current!.name}: added on disk`);
    else if (!current) differences.push(`#${id} ${old.name}: removed from disk`);
    else if (old.name !== current.name || old.color.r !== current.color.r || old.color.g !== current.color.g || old.color.b !== current.color.b) {
      differences.push(`#${id}: ${old.name} (${old.color.r},${old.color.g},${old.color.b}) → ${current.name} (${current.color.r},${current.color.g},${current.color.b}) on disk`);
    }
  }
  return differences;
}
