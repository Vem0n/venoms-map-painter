/** Province inspector state + mod file editing handlers */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { ProvinceData, LandedTitleNode } from '@shared/types';
import { renameTitleTree } from '@shared/save-safety';
import type { TitleRename } from '@shared/save-safety';
import { indexTitleHierarchy } from '@shared/title-hierarchy';
import { hexToRgb } from '@shared/colors';
import { theme } from '../theme';
import { MAX_ZOOM } from '@shared/constants';
import type { EngineRef, RegistryRef, ModPathRef, PendingMapRef } from './types';
import type { SidebarMode } from './types';

export interface UseProvinceInspectorParams {
  engineRef: EngineRef;
  registryRef: RegistryRef;
  modPathRef: ModPathRef;
  pendingMapRef: PendingMapRef;
  setStatus: (msg: string) => void;
  setDraftDirty: (dirty: boolean) => void;
  setZoomLevel: (zoom: number) => void;
}

export function useProvinceInspector({
  engineRef, registryRef, modPathRef, pendingMapRef,
  setStatus, setDraftDirty, setZoomLevel,
}: UseProvinceInspectorParams) {
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('painting');
  const [selectedProvince, setSelectedProvince] = useState<ProvinceData | null>(null);
  const [modLoaded, setModLoaded] = useState(false);
  const [modDirty, setModDirty] = useState(false);
  const [modifiedProvinceIds, setModifiedProvinceIds] = useState<Set<number>>(new Set());
  const [landedTitles, setLandedTitles] = useState<LandedTitleNode[]>([]);
  const [titleRenames, setTitleRenames] = useState<TitleRename[]>([]);
  const [historyFiles, setHistoryFiles] = useState<string[]>([]);
  // Keep the tier selected while the inspected province (and its owning title) changes.
  const [highlightedTier, setHighlightedTier] = useState<Exclude<LandedTitleNode['tier'], 'b'> | null>(null);
  const registryRevision = registryRef.current.revision;
  const pendingSignature = JSON.stringify(pendingMapRef.current.getAll().map(entry =>
    [entry.id, entry.name, entry.request.parentTitle, entry.request.createCounty, entry.request.parentDuchy]));
  const hierarchyIndex = useMemo(() => {
    const renamed = (key: string | undefined) => titleRenames.reduce((value, rename) => value === rename.oldKey ? rename.newKey : value, key);
    const pending = pendingMapRef.current.getAll().map(entry => ({ ...entry, request: {
      ...entry.request, parentTitle: renamed(entry.request.parentTitle), parentDuchy: renamed(entry.request.parentDuchy),
    } }));
    return indexTitleHierarchy(landedTitles, registryRef.current.getAllProvinces(), pending);
  }, [landedTitles, registryRevision, pendingSignature, titleRenames, registryRef, pendingMapRef]);
  const activeTitle = highlightedTier && selectedProvince
    ? hierarchyIndex.chains.get(selectedProvince.id)?.find(title => title.tier === highlightedTier)
    : undefined;
  const titleProvinceCount = activeTitle ? hierarchyIndex.members.get(activeTitle.key)?.size ?? 0 : 0;
  const tierLabel = highlightedTier ? { c: 'County', d: 'Duchy', k: 'Kingdom', e: 'Empire', h: 'Hegemony' }[highlightedTier] : null;
  const titleHighlightLabel = activeTitle?.key ?? (tierLabel ? `${tierLabel} view — no ${tierLabel.toLowerCase()} assigned` : '');

  const clearTitleHighlight = useCallback(() => {
    engineRef.current?.clearTitleHighlight();
    setHighlightedTier(null);
  }, [engineRef]);

  useEffect(() => {
    if (!modLoaded) clearTitleHighlight();
  }, [modLoaded, clearTitleHighlight]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!activeTitle) {
      engine.clearTitleHighlight();
      return;
    }
    const colors = Array.from(hierarchyIndex.members.get(activeTitle.key) ?? []).flatMap(id => {
      const province = registryRef.current.getProvinceById(id);
      return province ? [province.color] : [];
    });
    const tint = { b: theme.text.secondary, c: theme.accent.blue, d: theme.accent.purple, k: theme.accent.yellow, e: theme.accent.red, h: theme.accent.green }[activeTitle.tier] ?? theme.text.secondary;
    engine.setTitleHighlight(colors, hexToRgb(tint)!);
  }, [activeTitle, hierarchyIndex, engineRef, registryRef]);

  useEffect(() => () => { engineRef.current?.clearTitleHighlight(); }, [engineRef]);

  const handleTitleHighlight = useCallback((key: string) => {
    const tier = hierarchyIndex.titles.get(key)?.tier;
    if (!tier || tier === 'b') return;
    setHighlightedTier(previous => previous === tier ? null : tier);
  }, [hierarchyIndex]);

  // Map/draft loading starts a fresh inspection session, even when loading the same mod.
  const resetSelectedProvince = useCallback((province: ProvinceData | null) => {
    clearTitleHighlight();
    setSelectedProvince(province);
  }, [clearTitleHighlight]);

  const handleProvinceClick = useCallback((gx: number, gy: number) => {
    const engine = engineRef.current;
    if (!engine || !engine.isLoaded()) return;

    const px = engine.getPixel(gx, gy);
    const province = registryRef.current.getProvinceByColor(px);
    setSelectedProvince(province || null);
  }, [engineRef, registryRef]);

  const handleProvinceEdit = useCallback((updated: ProvinceData) => {
    setSelectedProvince(updated);
    setModDirty(true);
    setDraftDirty(true);
    setModifiedProvinceIds(prev => new Set(prev).add(updated.id));

    const registry = registryRef.current;
    const existing = registry.getProvinceById(updated.id);
    if (existing) {
      Object.assign(existing, updated);
    }
  }, [registryRef, setDraftDirty]);

  const handleFetchHierarchy = useCallback(async (provinceId: number): Promise<LandedTitleNode[]> => {
    return hierarchyIndex.chains.get(provinceId) ?? [];
  }, [hierarchyIndex]);

  const handleTitleRename = useCallback((oldKey: string, newKey: string) => {
    const rename = { oldKey, newKey };
    setTitleRenames(prev => [...prev, rename]);
    setLandedTitles(prev => renameTitleTree(prev, [rename]));
    for (const province of registryRef.current.getAllProvinces()) {
      if (province.titleKey === oldKey) province.titleKey = newKey;
    }
    setModDirty(true);
    setDraftDirty(true);
    setStatus(`Title rename staged: ${oldKey} → ${newKey}. Save Draft to keep it, or Save to Mod to apply it.`);
  }, [registryRef, setDraftDirty, setStatus]);

  const handleJumpToProvince = useCallback(async (province: ProvinceData) => {
    const engine = engineRef.current;
    if (!engine || !engine.isLoaded()) return;

    setStatus(`Searching for province ${province.id}: ${province.name}...`);
    const location = await engine.findColorLocationAsync(province.color);
    if (!location) {
      setStatus(`Province "${province.name}" has no pixels on the map`);
      return;
    }

    engine.centerOn(location.gx, location.gy, MAX_ZOOM);
    setZoomLevel(engine.getZoom());
    setStatus(`Jumped to province ${province.id}: ${province.name}`);
  }, [engineRef, setStatus, setZoomLevel]);

  return {
    sidebarMode, selectedProvince, modLoaded, modDirty,
    highlightedTitle: activeTitle?.key ?? null, highlightedTier, titleHighlightLabel, titleProvinceCount, handleTitleHighlight, clearTitleHighlight,
    modifiedProvinceIds, landedTitles, historyFiles, titleRenames, setTitleRenames,
    handleProvinceClick, handleProvinceEdit, handleFetchHierarchy,
    handleTitleRename, handleJumpToProvince,
    setSidebarMode, setSelectedProvince: resetSelectedProvince, setModLoaded, setModDirty,
    setModifiedProvinceIds, setLandedTitles, setHistoryFiles,
  };
}
