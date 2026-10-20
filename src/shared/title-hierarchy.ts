import type { LandedTitleNode, PendingProvince, ProvinceData } from './types';

export interface TitleHierarchyIndex {
  /** Leaf-first de jure chain, including explicitly assigned pending provinces. */
  chains: Map<number, LandedTitleNode[]>;
  /** Current province IDs under each title, including disconnected map pieces. */
  members: Map<string, Set<number>>;
  titles: Map<string, LandedTitleNode>;
}

/** Project loaded titles onto current registry identities, without changing mod data. */
export function indexTitleHierarchy(
  roots: LandedTitleNode[], provinces: ProvinceData[], pending: PendingProvince[],
): TitleHierarchyIndex {
  const titles = new Map<string, LandedTitleNode>();
  const parents = new Map<string, string>();
  const byId = new Map<number, LandedTitleNode>();
  const visit = (nodes: LandedTitleNode[], parent?: string) => {
    for (const node of nodes) {
      titles.set(node.key, node);
      if (parent) parents.set(node.key, parent);
      if (node.provinceId !== undefined) byId.set(node.provinceId, node);
      visit(node.children, node.key);
    }
  };
  visit(roots);
  const pendingById = new Map(pending.map(entry => [entry.id, entry]));
  // Include new counties before processing their baronies; pending entries need not be ordered.
  for (const { request } of pending) {
    if (request.createCounty && request.parentTitle && !titles.has(request.parentTitle)) {
      titles.set(request.parentTitle, { key: request.parentTitle, tier: 'c', children: [] });
      if (request.parentDuchy && titles.get(request.parentDuchy)?.tier === 'd') {
        parents.set(request.parentTitle, request.parentDuchy);
      }
    }
  }
  const chains = new Map<number, LandedTitleNode[]>();
  const members = new Map<string, Set<number>>();
  for (const province of provinces) {
    const entry = pendingById.get(province.id);
    let leaf: LandedTitleNode | undefined;
    let pendingParent: string | undefined;
    if (entry) {
      // Pending IDs may reuse a removed province ID. Never inherit its old hierarchy.
      pendingParent = entry.request.parentTitle;
      if (!pendingParent || titles.get(pendingParent)?.tier !== 'c') continue;
      leaf = { key: `b_${entry.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`, tier: 'b', provinceId: province.id, children: [] };
    } else {
      // Title keys survive in-memory ID reconciliation; raw tree IDs may be stale.
      leaf = province.titleKey ? titles.get(province.titleKey) : byId.get(province.id);
    }
    if (!leaf) continue;
    const chain: LandedTitleNode[] = [leaf];
    const seen = new Set([leaf.key]);
    let parentKey = pendingParent ?? parents.get(leaf.key);
    while (parentKey && !seen.has(parentKey)) {
      const parent = titles.get(parentKey);
      if (!parent) break;
      chain.push(parent);
      seen.add(parentKey);
      parentKey = parents.get(parentKey);
    }
    chains.set(province.id, chain);
    for (const node of chain) {
      let ids = members.get(node.key);
      if (!ids) members.set(node.key, ids = new Set());
      ids.add(province.id);
    }
  }
  return { chains, members, titles };
}
