/**
 * App — Root React component.
 *
 * Layout: TopBar (36px) + VerticalToolBar (40px) | MainCanvas | Right Panel (320px) + StatusBar (24px)
 * Manages the TileEngine lifecycle, ToolManager, ColorRegistry, and UndoManager.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import MainCanvas from './components/MainCanvas';
import Toolbar from './components/Toolbar';
import VerticalToolBar from './components/VerticalToolBar';
import StatusBar from './components/StatusBar';
import ColorPicker from './components/ColorPicker';
import ProvinceInspector from './components/ProvinceInspector';
import ProvinceCreator from './components/ProvinceCreator';
import { TileEngine } from '@engine/tile-engine';
import { UndoManager } from '@engine/undo-manager';
import { ColorRegistry } from '@registry/color-registry';
import { ToolManager } from '@tools/tool-manager';
import ProvinceSearch from './components/ProvinceSearch';
import ReconcileDialog from './components/ReconcileDialog';
import { theme } from './theme';
import type { ToolType, RGB, ProvinceData, LandedTitleNode, CreateProvinceRequest } from '@shared/types';
import { rgbToKey } from '@shared/types';
import { MAX_ZOOM } from '@shared/constants';
import { detectOrphans, buildIdRemap } from '../reconciliation/reconcile';
import type { OrphanedParent } from '../reconciliation/reconcile';

type SidebarMode = 'painting' | 'inspector' | 'creator';

export default function App() {
  const [status, setStatus] = useState('No map loaded');
  const [cursorPos, setCursorPos] = useState<{ gx: number; gy: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolType>('flood-fill');
  const [activeColor, setActiveColor] = useState<RGB>({ r: 255, g: 0, b: 0 });
  const [brushRadius, setBrushRadius] = useState(3);
  const [respectBorders, setRespectBorders] = useState(true);
  const [pickingEmpty, setPickingEmpty] = useState(false);
  const [emptyColors, setEmptyColors] = useState<RGB[]>([{ r: 0, g: 0, b: 0 }]);
  const [pickingLock, setPickingLock] = useState(false);
  const [pickingColor, setPickingColor] = useState(false);
  const [lockedColor, setLockedColor] = useState<RGB | null>(null);
  const [provinceCount, setProvinceCount] = useState(0);
  const [hoverInspect, setHoverInspect] = useState(false);
  const [, forceUpdate] = useState(0);

  // Sidebar mode
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('painting');
  const [selectedProvince, setSelectedProvince] = useState<ProvinceData | null>(null);
  const [modLoaded, setModLoaded] = useState(false);
  const [modDirty, setModDirty] = useState(false);
  const [modifiedProvinceIds, setModifiedProvinceIds] = useState<Set<number>>(new Set());
  const [landedTitles, setLandedTitles] = useState<LandedTitleNode[]>([]);
  const [historyFiles, setHistoryFiles] = useState<string[]>([]);

  // Reconciliation dialog state
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [reconcileOrphans, setReconcileOrphans] = useState<ProvinceData[]>([]);
  const [reconcileParents, setReconcileParents] = useState<OrphanedParent[]>([]);

  // Current mod path
  const modPathRef = useRef<string | null>(null);

  // Core objects — created once, persisted across renders
  const engineRef = useRef<TileEngine | null>(null);
  const undoManagerRef = useRef<UndoManager>(new UndoManager());
  const registryRef = useRef<ColorRegistry>(new ColorRegistry());
  const toolManagerRef = useRef<ToolManager | null>(null);

  const handleEngineReady = useCallback((engine: TileEngine) => {
    engineRef.current = engine;

    // Create ToolManager now that we have the engine
    const tm = new ToolManager(engine, registryRef.current, undoManagerRef.current);
    tm.setColor({ r: 255, g: 0, b: 0 });
    tm.setOnPaintEvent((event) => {
      if (event.warning) {
        setStatus(event.warning);
      } else if (event.pixelCount >= 0) {
        setStatus(`${event.tool}: ${event.pixelCount} pixels`);
      }
      // Force re-render for undo/redo button state
      forceUpdate(n => n + 1);
    });
    toolManagerRef.current = tm;
  }, []);

  const handleCursorMove = useCallback((gx: number, gy: number) => {
    setCursorPos({ gx, gy });
  }, []);

  const handleZoomChange = useCallback((zoom: number) => {
    setZoomLevel(zoom);
  }, []);

  const handleToggleGrid = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.toggleGrid();
    setGridEnabled(engine.getShowGrid());
  }, []);

  const handleToggleHoverInspect = useCallback(() => {
    setHoverInspect(prev => !prev);
  }, []);

  const handleToolChange = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    toolManagerRef.current?.setTool(tool);
  }, []);

  const handleColorChange = useCallback((color: RGB) => {
    setActiveColor(color);
    toolManagerRef.current?.setColor(color);
  }, []);

  const handleBrushRadiusChange = useCallback((radius: number) => {
    setBrushRadius(radius);
    toolManagerRef.current?.setBrushRadius(radius);
  }, []);

  const handleToggleRespectBorders = useCallback(() => {
    const tm = toolManagerRef.current;
    if (!tm) return;
    const newValue = !tm.getRespectBorders();
    tm.setRespectBorders(newValue);
    setRespectBorders(newValue);
  }, []);

  const handleDefineEmpty = useCallback(() => {
    setPickingEmpty(prev => !prev);
    setPickingLock(false);
    setPickingColor(false);
  }, []);

  const handlePickEmpty = useCallback((color: RGB) => {
    const tm = toolManagerRef.current;
    if (!tm) return;
    tm.addEmptyColor(color);
    setEmptyColors(tm.getEmptyColors());
    setPickingEmpty(false);
    setStatus(`Defined empty color: (${color.r}, ${color.g}, ${color.b})`);
    forceUpdate(n => n + 1);
  }, []);

  const handleRemoveEmpty = useCallback((color: RGB) => {
    const tm = toolManagerRef.current;
    if (!tm) return;
    tm.removeEmptyColor(color);
    setEmptyColors(tm.getEmptyColors());
    setStatus(`Removed empty color: (${color.r}, ${color.g}, ${color.b})`);
    forceUpdate(n => n + 1);
  }, []);

  const handleTogglePickLock = useCallback(() => {
    setPickingLock(prev => !prev);
    setPickingEmpty(false);
    setPickingColor(false);
  }, []);

  const handlePickLock = useCallback((color: RGB) => {
    const tm = toolManagerRef.current;
    if (!tm) return;
    tm.setLockedColor(color);
    setLockedColor(color);
    setPickingLock(false);
    setStatus(`Province locked to color: (${color.r}, ${color.g}, ${color.b})`);
  }, []);

  const handleClearLock = useCallback(() => {
    const tm = toolManagerRef.current;
    if (!tm) return;
    tm.setLockedColor(null);
    setLockedColor(null);
    setStatus('Province lock cleared');
  }, []);

  const handleTogglePickColor = useCallback(() => {
    setPickingColor(prev => !prev);
    setPickingEmpty(false);
    setPickingLock(false);
  }, []);

  const handlePickColor = useCallback((color: RGB) => {
    handleColorChange(color);
    setPickingColor(false);
    setStatus(`Active color set to: (${color.r}, ${color.g}, ${color.b})`);
  }, [handleColorChange]);

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
  }, []);

  const handleUndo = useCallback(() => {
    if (toolManagerRef.current?.undo()) {
      setStatus('Undo');
      forceUpdate(n => n + 1);
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (toolManagerRef.current?.redo()) {
      setStatus('Redo');
      forceUpdate(n => n + 1);
    }
  }, []);

  // Province click handler for inspector mode
  const handleProvinceClick = useCallback((gx: number, gy: number) => {
    const engine = engineRef.current;
    if (!engine || !engine.isLoaded()) return;

    const px = engine.getPixel(gx, gy);
    const province = registryRef.current.getProvinceByColor(px);
    setSelectedProvince(province || null);
  }, []);

  // Inspector: edit province data
  const handleProvinceEdit = useCallback((updated: ProvinceData) => {
    setSelectedProvince(updated);
    setModDirty(true);
    setModifiedProvinceIds(prev => new Set(prev).add(updated.id));

    // Update registry
    const registry = registryRef.current;
    const existing = registry.getProvinceById(updated.id);
    if (existing) {
      Object.assign(existing, updated);
    }
  }, []);

  // Inspector: fetch hierarchy
  const handleFetchHierarchy = useCallback(async (provinceId: number): Promise<LandedTitleNode[]> => {
    try {
      return await window.mapPainter.getHierarchy(provinceId);
    } catch {
      return [];
    }
  }, []);

  // Inspector: rename a title key
  const handleTitleRename = useCallback(async (oldKey: string, newKey: string) => {
    try {
      const success = await window.mapPainter.renameTitle(oldKey, newKey);
      if (success) {
        setModDirty(true);
        setStatus(`Renamed title: ${oldKey} -> ${newKey}`);
      } else {
        setStatus(`Title not found: ${oldKey}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Rename error: ${msg}`);
    }
  }, []);

  // Inspector: save mod files only
  const handleSaveMod = useCallback(async () => {
    if (!modPathRef.current) return;

    try {
      setStatus('Saving mod files...');
      const provinces = registryRef.current.getAllProvinces();
      await window.mapPainter.saveMod({
        provinces,
        modifiedProvinceIds: Array.from(modifiedProvinceIds),
      });
      setModDirty(false);
      setModifiedProvinceIds(new Set());
      setStatus('Mod files saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Save error: ${msg}`);
    }
  }, [modifiedProvinceIds]);

  // Perform the actual save (image + mod files) — called after reconciliation or directly
  const performSave = useCallback(async () => {
    const engine = engineRef.current;
    if (!modPathRef.current || !engine || !engine.isLoaded()) return;

    try {
      setStatus('Saving provinces.png...');
      const rgbaBuffer = new Uint8Array(engine.stitchFullImage().buffer);
      const { width, height } = engine.getMapSize();
      await window.mapPainter.saveImage(modPathRef.current, rgbaBuffer, width, height);

      setStatus('Saving mod files...');
      const provinces = registryRef.current.getAllProvinces();
      await window.mapPainter.saveMod({
        provinces,
        modifiedProvinceIds: Array.from(modifiedProvinceIds),
      });
      setModDirty(false);
      setModifiedProvinceIds(new Set());

      setStatus('Saved provinces.png + mod files');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Save error: ${msg}`);
    }
  }, [modifiedProvinceIds]);

  // Save everything: scan for orphans first, show reconciliation dialog if needed
  const handleSaveAll = useCallback(async () => {
    const engine = engineRef.current;
    if (!modPathRef.current || !engine || !engine.isLoaded()) {
      setStatus('Nothing to save — load a map first');
      return;
    }

    try {
      // Scan the map for colors actually present
      setStatus('Scanning map for orphaned provinces...');
      const emptyColorKeys = new Set(emptyColors.map(c => rgbToKey(c)));
      const usedColors = await engine.collectUsedColorsAsync(emptyColorKeys);

      // Detect orphans
      const allProvinces = registryRef.current.getAllProvinces();
      const { orphanedProvinces, orphanedParents } = detectOrphans(
        allProvinces, usedColors, landedTitles
      );

      if (orphanedProvinces.length > 0) {
        // Show reconciliation dialog
        setReconcileOrphans(orphanedProvinces);
        setReconcileParents(orphanedParents);
        setShowReconcileDialog(true);
      } else {
        // No orphans — save directly
        await performSave();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Save error: ${msg}`);
    }
  }, [emptyColors, landedTitles, performSave]);

  // Reconciliation: user confirmed removal
  const handleReconcileConfirm = useCallback(async (
    confirmedRemovedIds: number[],
    confirmedRemovedTitleKeys: string[]
  ) => {
    setShowReconcileDialog(false);

    if (confirmedRemovedIds.length === 0) {
      // Nothing to remove, just save
      await performSave();
      return;
    }

    try {
      setStatus('Reconciling provinces...');
      const allProvinces = registryRef.current.getAllProvinces();
      const removedSet = new Set(confirmedRemovedIds);

      // Build sequential ID remap
      const idMapEntries = buildIdRemap(allProvinces, removedSet);
      const idMap: Record<number, number> = {};
      for (const [oldId, newId] of idMapEntries) {
        idMap[oldId] = newId;
      }

      // Build surviving province list with new IDs
      const surviving = allProvinces
        .filter(p => !removedSet.has(p.id))
        .map(p => ({ ...p, id: idMap[p.id] ?? p.id }))
        .sort((a, b) => a.id - b.id);

      // Send to main process for file cleanup
      await window.mapPainter.reconcileProvinces({
        removedIds: confirmedRemovedIds,
        idMap,
        removedTitleKeys: confirmedRemovedTitleKeys,
        provinces: surviving,
      });

      // Update registry
      for (const id of confirmedRemovedIds) {
        registryRef.current.removeProvince(id);
      }
      registryRef.current.applyIdRemap(idMapEntries);
      setProvinceCount(registryRef.current.count);

      setStatus(`Reconciled: removed ${confirmedRemovedIds.length} provinces, renumbered IDs`);

      // Now perform the normal save
      await performSave();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Reconciliation error: ${msg}`);
    }
  }, [performSave]);

  // Reconciliation: user cancelled
  const handleReconcileCancel = useCallback(() => {
    setShowReconcileDialog(false);
    setStatus('Save cancelled — orphaned provinces detected');
  }, []);

  // Creator: create new province
  const handleCreateProvince = useCallback(async (request: CreateProvinceRequest): Promise<ProvinceData | null> => {
    try {
      setStatus(`Creating province "${request.name}"...`);
      const province = await window.mapPainter.createProvince(request) as ProvinceData;

      // Add to color registry (ID already assigned by backend)
      registryRef.current.addProvince(province);
      setProvinceCount(registryRef.current.count);

      // Suggest a new unique color for the next province
      try {
        const suggested = registryRef.current.suggestNextColor();
        handleColorChange(suggested);
      } catch {
        // Exhausted colors, unlikely
      }

      setStatus(`Created province #${province.id}: ${province.name}`);
      forceUpdate(n => n + 1);
      return province;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Create error: ${msg}`);
      return null;
    }
  }, [handleColorChange]);

  const handleOpenMap = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setStatus('Selecting directory...');

    try {
      const modPath = await window.mapPainter.selectDirectory();
      if (!modPath) {
        setStatus('No directory selected');
        setLoading(false);
        return;
      }

      const engine = engineRef.current;
      if (!engine) {
        setStatus('Engine not initialized');
        setLoading(false);
        return;
      }

      // Load the image inside a block so the large IPC buffer goes fully
      // out of scope after chunking into tiles — no dangling references.
      setStatus('Loading provinces.png...');
      let imgW: number;
      let imgH: number;
      {
        const { buffer, width, height } = await window.mapPainter.loadImage(modPath);
        imgW = width;
        imgH = height;
        engine.loadImage(buffer, width, height);
        // `buffer` goes out of scope here — eligible for GC
      }

      // Clear undo history for new map
      undoManagerRef.current.clear();

      // Load full mod (definition.csv + landed_titles + history)
      setStatus('Loading mod files...');
      const modResult = await window.mapPainter.loadMod(modPath);

      if (!modResult.success || !modResult.data) {
        const errMsg = modResult.error || 'Unknown error';
        console.warn('load-mod warning:', errMsg);
        setStatus(`Loaded map (${imgW}x${imgH}) — ${errMsg}`);

        // Fallback to basic definition.csv loading
        const defResult = await window.mapPainter.loadDefinitions(modPath);
        if (!defResult.error) {
          registryRef.current.loadFromDefinitions(defResult.provinces as ProvinceData[]);
          setProvinceCount(registryRef.current.count);
        }
      } else {
        registryRef.current.loadFromDefinitions(modResult.data.provinces);
        setProvinceCount(registryRef.current.count);
        setLandedTitles(modResult.data.landedTitles);
        const titleCount = modResult.data.landedTitles.length;
        setStatus(`Loaded ${imgW}x${imgH} map — ${registryRef.current.count} provinces, ${titleCount} title trees`);
        setModLoaded(true);
      }

      modPathRef.current = modPath;
      setModDirty(false);
      setModifiedProvinceIds(new Set());
      setSelectedProvince(null);

      // Fetch history file list for the Advanced wizard
      try {
        const hFiles = await window.mapPainter.listHistoryFiles();
        setHistoryFiles(hFiles);
      } catch {
        setHistoryFiles([]);
      }

      // Suggest a unique color for the user to start with
      try {
        const suggested = registryRef.current.suggestNextColor();
        handleColorChange(suggested);
      } catch {
        // Registry might be empty, that's fine
      }

      forceUpdate(n => n + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      console.error('Failed to load map:', err);
    } finally {
      setLoading(false);
    }
  }, [loading, handleColorChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Ctrl+Z = undo, Ctrl+Shift+Z = redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      // Ctrl+Y = redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Ctrl+S = save everything (map image + mod files)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveAll();
        return;
      }

      // Escape cancels picking modes
      if (e.key === 'Escape') {
        setPickingEmpty(false);
        setPickingLock(false);
        setPickingColor(false);
        return;
      }

      // Tool shortcuts (no modifier, only in painting mode)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'f':
            handleToolChange('flood-fill');
            break;
          case 'b':
            handleToolChange('brush');
            break;
          case 'e':
            handleToolChange('eraser');
            break;
          case 'h':
            handleToggleHoverInspect();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToolChange, handleUndo, handleRedo, handleSaveAll, handleToggleHoverInspect]);

  // Get pixel color under cursor for inspector display
  const pixelColor = (cursorPos && engineRef.current?.isLoaded())
    ? engineRef.current!.getPixel(cursorPos.gx, cursorPos.gy)
    : null;

  const tm = toolManagerRef.current;

  const mapLoaded = engineRef.current?.isLoaded() ?? false;
  const tabs: { key: SidebarMode; label: string }[] = [
    { key: 'painting', label: 'Paint' },
    { key: 'inspector', label: `Inspect${modDirty ? ' *' : ''}` },
    { key: 'creator', label: 'Create' },
  ];
  const activeTabIndex = tabs.findIndex(t => t.key === sidebarMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', userSelect: 'none', background: theme.bg.base }}>
      {/* Top bar — file ops only */}
      <Toolbar
        onOpenMap={handleOpenMap}
        onSaveAll={handleSaveAll}
        mapLoaded={mapLoaded}
        loading={loading}
      />

      {/* Main area: VerticalToolBar | Canvas | Right Panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <VerticalToolBar
          activeTool={activeTool}
          onToolChange={handleToolChange}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={tm?.canUndo ?? false}
          canRedo={tm?.canRedo ?? false}
          brushRadius={brushRadius}
          onBrushRadiusChange={handleBrushRadiusChange}
          respectBorders={respectBorders}
          onToggleRespectBorders={handleToggleRespectBorders}
          pickingEmpty={pickingEmpty}
          onDefineEmpty={handleDefineEmpty}
          emptyColors={emptyColors}
          onRemoveEmpty={handleRemoveEmpty}
          pickingLock={pickingLock}
          onTogglePickLock={handleTogglePickLock}
          lockedColor={lockedColor}
          onClearLock={handleClearLock}
          pickingColor={pickingColor}
          onTogglePickColor={handleTogglePickColor}
          gridEnabled={gridEnabled}
          onToggleGrid={handleToggleGrid}
          hoverInspect={hoverInspect}
          onToggleHoverInspect={handleToggleHoverInspect}
          mapLoaded={mapLoaded}
        />

        <MainCanvas
          onEngineReady={handleEngineReady}
          onCursorMove={handleCursorMove}
          onZoomChange={handleZoomChange}
          toolManagerRef={toolManagerRef}
          pickingEmpty={pickingEmpty}
          onPickEmpty={handlePickEmpty}
          pickingLock={pickingLock}
          onPickLock={handlePickLock}
          pickingColor={pickingColor}
          onPickColor={handlePickColor}
          inspectorMode={sidebarMode === 'inspector'}
          onProvinceClick={handleProvinceClick}
          hoverInspect={hoverInspect}
          registryRef={registryRef}
        />

        {/* Right Panel */}
        <div style={{
          width: 320,
          background: theme.bg.panel,
          borderLeft: `1px solid ${theme.border.default}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}>
          {/* Animated tab bar */}
          <div style={{
            display: 'flex',
            position: 'relative',
            borderBottom: `1px solid ${theme.border.default}`,
            flexShrink: 0,
          }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSidebarMode(tab.key)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  background: 'transparent',
                  color: sidebarMode === tab.key ? theme.text.primary : theme.text.muted,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: theme.font.sizeMd,
                  fontFamily: theme.font.family,
                  fontWeight: sidebarMode === tab.key ? 600 : 400,
                  transition: theme.transition.fast,
                }}
              >
                {tab.label}
              </button>
            ))}
            {/* Sliding underline */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: `${activeTabIndex * (100 / tabs.length)}%`,
              width: `${100 / tabs.length}%`,
              height: 2,
              background: theme.accent.blue,
              transition: 'left 0.25s ease',
            }} />
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: theme.space.lg }}>
            {/* All panels stay mounted so state persists across tab switches */}
            <div style={{ display: sidebarMode === 'painting' ? 'block' : 'none' }}>
              <ColorPicker
                color={activeColor}
                onChange={handleColorChange}
                registry={registryRef.current}
              />

              <div style={{ borderTop: `1px solid ${theme.border.muted}`, margin: `${theme.space.lg}px 0` }} />

              <ProvinceSearch
                registry={registryRef.current}
                onJumpToProvince={handleJumpToProvince}
              />

              <div style={{ borderTop: `1px solid ${theme.border.muted}`, margin: `${theme.space.lg}px 0` }} />

              <h3 style={{
                color: theme.text.primary,
                margin: '0 0 8px',
                fontSize: theme.font.sizeXl,
                fontWeight: 600,
                letterSpacing: '-0.2px',
              }}>Hover Inspector</h3>
              {cursorPos && engineRef.current?.isLoaded() ? (
                (() => {
                  const px = engineRef.current!.getPixel(cursorPos.gx, cursorPos.gy);
                  const province = registryRef.current.getProvinceByColor(px);
                  return (
                    <div style={{ fontSize: theme.font.sizeMd }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: theme.radius.sm,
                          border: `1px solid ${theme.border.default}`,
                          background: `rgb(${px.r},${px.g},${px.b})`,
                        }} />
                        <span style={{ color: theme.text.secondary, fontFamily: theme.font.mono, fontSize: theme.font.sizeSm }}>
                          ({px.r}, {px.g}, {px.b})
                        </span>
                      </div>
                      {province ? (
                        <div style={{ color: theme.text.secondary, lineHeight: 1.6 }}>
                          <div>ID: {province.id}</div>
                          <div>Name: {province.name}</div>
                          {province.titleKey && <div>Title: {province.titleKey}</div>}
                          {province.culture && <div>Culture: {province.culture}</div>}
                          {province.religion && <div>Religion: {province.religion}</div>}
                        </div>
                      ) : (
                        <div style={{ color: theme.text.muted }}>
                          {px.r === 0 && px.g === 0 && px.b === 0 ? 'Unassigned (ocean)' : 'No province data'}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <p style={{ color: theme.text.muted, fontSize: theme.font.sizeSm }}>Hover over map to inspect</p>
              )}

              <div style={{ borderTop: `1px solid ${theme.border.muted}`, margin: `${theme.space.lg}px 0` }} />

              <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs, lineHeight: 1.8 }}>
                <div>F = Fill &nbsp; B = Brush &nbsp; E = Eraser &nbsp; H = Inspect</div>
                <div>Ctrl+Z = Undo &nbsp; Ctrl+Y = Redo</div>
                <div>Middle/Right = Pan &nbsp; Scroll = Zoom</div>
              </div>
            </div>

            <div style={{ display: sidebarMode === 'inspector' ? 'block' : 'none' }}>
              <ProvinceInspector
                province={selectedProvince}
                pixelColor={pixelColor}
                onFetchHierarchy={handleFetchHierarchy}
                onProvinceEdit={handleProvinceEdit}
                onTitleRename={handleTitleRename}
                onSave={handleSaveMod}
                isDirty={modDirty}
                modLoaded={modLoaded}
              />
            </div>

            <div style={{ display: sidebarMode === 'creator' ? 'block' : 'none' }}>
              <ProvinceCreator
                activeColor={activeColor}
                landedTitles={landedTitles}
                onCreate={handleCreateProvince}
                modLoaded={modLoaded}
                historyFiles={historyFiles}
              />
            </div>
          </div>
        </div>
      </div>

      <StatusBar
        cursorPos={cursorPos}
        zoomLevel={zoomLevel}
        status={status}
        activeTool={activeTool}
        activeColor={activeColor}
        provinceCount={provinceCount}
      />

      {showReconcileDialog && (
        <ReconcileDialog
          orphanedProvinces={reconcileOrphans}
          orphanedParents={reconcileParents}
          onConfirm={handleReconcileConfirm}
          onCancel={handleReconcileCancel}
        />
      )}
    </div>
  );
}
