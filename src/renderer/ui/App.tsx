/**
 * App — Root React component (composition root).
 *
 * Layout: TopBar (36px) + VerticalToolBar (40px) | MainCanvas | Right Panel (320px) + StatusBar (24px)
 * State + handlers are extracted into custom hooks in ./hooks/.
 * This file wires hooks together and renders the JSX template.
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
import PendingOrphanDialog from './components/PendingOrphanDialog';
import PendingProvinces from './components/PendingProvinces';
import SaveDraftDialog from './components/SaveDraftDialog';
import DraftListDialog from './components/DraftListDialog';
import UnsavedDraftDialog from './components/UnsavedDraftDialog';
import LoadingOverlay from './components/LoadingOverlay';
import ProvinceGenerator from './components/ProvinceGenerator';
import SelectionActionBar from './components/SelectionActionBar';
import SectorMapDrawer from './components/SectorMapDrawer';
import IdDriftDialog from './components/IdDriftDialog';
import { theme } from './theme';
import type { ToolType, RGB, CreateProvinceRequest, PendingProvince } from '@shared/types';
import { rgbToKey } from '@shared/types';
import { PendingProvinceMap } from '@registry/pending-province-map';

// Hooks
import { useViewportSettings } from './hooks/useViewportSettings';
import { useLassoSelection } from './hooks/useLassoSelection';
import { usePaintingTools } from './hooks/usePaintingTools';
import { useColorPicking } from './hooks/useColorPicking';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useProvinceInspector } from './hooks/useProvinceInspector';
import { usePendingProvinces } from './hooks/usePendingProvinces';
import { useSaveReconciliation } from './hooks/useSaveReconciliation';
import { useVoronoiGenerator } from './hooks/useVoronoiGenerator';
import { useDraftSaveLoad } from './hooks/useDraftSaveLoad';
import { useMapLoading } from './hooks/useMapLoading';

export default function App() {
  const [status, setStatus] = useState('No map loaded');

  // Core shared refs — created once, persisted across renders
  const engineRef = useRef<TileEngine | null>(null);
  const undoManagerRef = useRef<UndoManager>(new UndoManager());
  const registryRef = useRef<ColorRegistry>(new ColorRegistry());
  const toolManagerRef = useRef<ToolManager | null>(null);
  const pendingMapRef = useRef<PendingProvinceMap>(new PendingProvinceMap());
  const modPathRef = useRef<string | null>(null);

  /* ── Hook calls (order matters for dependency wiring) ──────── */

  const viewport = useViewportSettings({ engineRef });

  const handleColorRemapRef = useRef<(oldColor: RGB, newColor: RGB) => void>(() => {});
  const activeColorRef = useRef<RGB>({ r: 255, g: 0, b: 0 });

  const lasso = useLassoSelection({
    engineRef, toolManagerRef, registryRef, undoManagerRef, activeColorRef,
    setStatus,
    setDraftDirty: (dirty: boolean) => setDraftDirtyRef.current(dirty),
    setModDirty: (dirty: boolean) => setModDirtyRef.current(dirty),
    setModifiedProvinceIds: (v) => setModifiedProvinceIdsRef.current(v),
    onColorRemap: (oldColor, newColor) => handleColorRemapRef.current(oldColor, newColor),
  });

  const painting = usePaintingTools({
    toolManagerRef,
    onBeforeToolChange: useCallback((oldTool: ToolType, newTool: ToolType) => {
      if (oldTool === 'lasso' && newTool !== 'lasso') {
        lasso.clearSelection();
      }
      if (newTool === 'lasso' && oldTool !== 'lasso') {
        const engine = engineRef.current;
        if (engine && engine.isOverlayVisible()) {
          engine.clearOverlay();
          engine.setOverlayVisible(false);
        }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lasso.clearSelection]),
  });

  // Keep activeColorRef in sync with painting tool's current color
  activeColorRef.current = painting.activeColor;

  // Placeholder refs for cross-hook wiring (avoids forward reference issues)
  const setDraftDirtyRef = useRef<(dirty: boolean) => void>(() => {});
  const setLoadingRef = useRef<(l: boolean) => void>(() => {});
  const setLoadingMessageRef = useRef<(msg: string | null) => void>(() => {});
  const setModDirtyRef = useRef<(dirty: boolean) => void>(() => {});
  const setModifiedProvinceIdsRef = useRef<React.Dispatch<React.SetStateAction<Set<number>>>>(() => {});

  const pending = usePendingProvinces({
    engineRef, registryRef, toolManagerRef, undoManagerRef, pendingMapRef,
    setStatus,
    setDraftDirty: (dirty: boolean) => setDraftDirtyRef.current(dirty),
    setModDirty: (dirty: boolean) => setModDirtyRef.current(dirty),
    setModifiedProvinceIds: (v) => setModifiedProvinceIdsRef.current(v),
    onColorChange: painting.handleColorChange,
    setSidebarMode: (mode) => inspector.setSidebarMode(mode),
    triggerForceUpdate: () => undoRedo.triggerForceUpdate(),
  });

  const undoRedo = useUndoRedo({
    toolManagerRef, pendingMapRef, registryRef, undoManagerRef,
    setStatus,
    setPendingCount: pending.setPendingCount,
    setProvinceCount: pending.setProvinceCount,
  });

  const colorPicking = useColorPicking({
    toolManagerRef,
    setStatus,
    onPickColor: painting.handleColorChange,
    triggerForceUpdate: undoRedo.triggerForceUpdate,
  });

  const inspector = useProvinceInspector({
    engineRef, registryRef, modPathRef,
    setStatus,
    setDraftDirty: (dirty: boolean) => setDraftDirtyRef.current(dirty),
    setZoomLevel: viewport.setZoomLevel,
  });

  const save = useSaveReconciliation({
    engineRef, registryRef, pendingMapRef, modPathRef,
    modifiedProvinceIds: inspector.modifiedProvinceIds,
    landedTitles: inspector.landedTitles,
    pendingSaveOptions: pending.pendingSaveOptions,
    setStatus,
    setDraftDirty: (dirty: boolean) => setDraftDirtyRef.current(dirty),
    setModDirty: inspector.setModDirty,
    setModifiedProvinceIds: inspector.setModifiedProvinceIds,
    setPendingCount: pending.setPendingCount,
    setProvinceCount: pending.setProvinceCount,
  });

  const voronoi = useVoronoiGenerator({
    engineRef, registryRef, undoManagerRef, pendingMapRef,
    setStatus,
    setDraftDirty: (dirty: boolean) => setDraftDirtyRef.current(dirty),
    setPendingCount: pending.setPendingCount,
    setProvinceCount: pending.setProvinceCount,
    cancelOtherPickingModes: useCallback(() => {
      colorPicking.setPickingEmpty(false);
      colorPicking.setPickingLock(false);
      colorPicking.setPickingColor(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    triggerForceUpdate: undoRedo.triggerForceUpdate,
  });

  const draft = useDraftSaveLoad({
    engineRef, registryRef, toolManagerRef, undoManagerRef, pendingMapRef, modPathRef,
    setStatus,
    pendingSaveOptions: pending.pendingSaveOptions,
    emptyColors: colorPicking.emptyColors,
    lockedColor: colorPicking.lockedColor,
    loading: false, // mapLoader not yet created; draft uses its own loading guard
    setLoading: (l: boolean) => setLoadingRef.current(l),
    setLoadingMessage: (msg: string | null) => setLoadingMessageRef.current(msg),
    setLandedTitles: inspector.setLandedTitles,
    setModLoaded: inspector.setModLoaded,
    setModDirty: inspector.setModDirty,
    setModifiedProvinceIds: inspector.setModifiedProvinceIds,
    setSelectedProvince: inspector.setSelectedProvince,
    setHistoryFiles: inspector.setHistoryFiles,
    setPendingCount: pending.setPendingCount,
    setProvinceCount: pending.setProvinceCount,
    setPendingSaveOptions: pending.setPendingSaveOptions,
    setEmptyColors: colorPicking.setEmptyColors,
    setLockedColor: colorPicking.setLockedColor,
    setHeightmapAvailable: viewport.setHeightmapAvailable,
    setHeightmapVisible: viewport.setHeightmapVisible,
    onColorChange: painting.handleColorChange,
    triggerForceUpdate: undoRedo.triggerForceUpdate,
  });

  // Now that draft/inspector/pending exist, wire up the refs
  setDraftDirtyRef.current = draft.setDraftDirty;
  setModDirtyRef.current = inspector.setModDirty;
  setModifiedProvinceIdsRef.current = inspector.setModifiedProvinceIds;
  handleColorRemapRef.current = pending.handleColorRemap;

  const mapLoader = useMapLoading({
    engineRef, registryRef, undoManagerRef, pendingMapRef, modPathRef, toolManagerRef,
    setStatus,
    setLandedTitles: inspector.setLandedTitles,
    setModLoaded: inspector.setModLoaded,
    setModDirty: inspector.setModDirty,
    setModifiedProvinceIds: inspector.setModifiedProvinceIds,
    setSelectedProvince: inspector.setSelectedProvince,
    setHistoryFiles: inspector.setHistoryFiles,
    setProvinceCount: pending.setProvinceCount,
    setPendingCount: pending.setPendingCount,
    setHeightmapAvailable: viewport.setHeightmapAvailable,
    setHeightmapVisible: viewport.setHeightmapVisible,
    setDraftDirty: draft.setDraftDirty,
    setDraftLoadedName: draft.setDraftLoadedName,
    onColorChange: painting.handleColorChange,
    triggerForceUpdate: undoRedo.triggerForceUpdate,
    guardUnsavedDraft: draft.guardUnsavedDraft,
  });

  // Wire mapLoader.setLoading and setLoadingMessage to draft's refs
  setLoadingRef.current = mapLoader.setLoading;
  setLoadingMessageRef.current = mapLoader.setLoadingMessage;

  /* ── Engine initialization ─────────────────────────────────── */

  const handleEngineReady = useCallback((engine: TileEngine) => {
    engineRef.current = engine;

    const tm = new ToolManager(engine, registryRef.current, undoManagerRef.current);
    tm.setColor({ r: 255, g: 0, b: 0 });
    tm.setOnPaintEvent((event) => {
      if (event.warning) {
        setStatus(event.warning);
      } else if (event.pixelCount >= 0) {
        setStatus(`${event.tool}: ${event.pixelCount} pixels`);
      }

      // Sector manager rescan: route to optimal method per tool
      const sm = registryRef.current.getSectorManager();
      if (sm.isPopulated) {
        if (event.tool === 'flood-fill' && event.affectedTiles) {
          sm.rescanByTiles(event.affectedTiles);
        } else if ((event.tool === 'brush' || event.tool === 'eraser') && event.bounds) {
          sm.rescanByBounds(
            event.bounds.minGx, event.bounds.minGy,
            event.bounds.maxGx, event.bounds.maxGy,
          );
        }
      }

      if (event.newProvince) {
        const { id, color, name } = event.newProvince;
        const pMap = pendingMapRef.current;
        const colorKey = rgbToKey(color);

        const request: CreateProvinceRequest = {
          name,
          color,
          titleTier: 'b',
        };
        const pendingEntry: PendingProvince = { id, color, name, request };

        if (!pMap.has(colorKey)) {
          pMap.add(pendingEntry);
        }

        const lastAction = tm.getLastUndoAction();
        if (lastAction) {
          lastAction.pendingAdded = [
            ...(lastAction.pendingAdded ?? []),
            pendingEntry,
          ];
        }

        pending.setPendingCount(pMap.count);
        pending.setProvinceCount(registryRef.current.count);
        setStatus(`Auto-registered Province #${id}`);
      }

      setDraftDirtyRef.current(true);
      undoRedo.triggerForceUpdate();

      if (pendingMapRef.current.count > 0) {
        pending.scheduleCheckPendingOrphans();
      }
    });
    toolManagerRef.current = tm;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.scheduleCheckPendingOrphans]);

  /* ── Keyboard shortcuts ────────────────────────────────────── */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) undoRedo.handleRedo();
        else undoRedo.handleUndo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        undoRedo.handleRedo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        draft.handleSaveDraft();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        save.handleSaveAll();
        return;
      }

      if (e.key === 'Escape') {
        colorPicking.setPickingEmpty(false);
        colorPicking.setPickingLock(false);
        colorPicking.setPickingColor(false);
        if (voronoi.pickingGenerator) voronoi.handleGeneratorCancelPicking();
        if (lasso.selectedProvinces.size > 0) {
          lasso.clearSelection();
          setStatus('Selection cleared');
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'f': painting.handleToolChange('flood-fill'); break;
          case 'b': painting.handleToolChange('brush'); break;
          case 'e': painting.handleToolChange('eraser'); break;
          case 'h': viewport.handleToggleHoverInspect(); break;
          case 'l': painting.handleToolChange('lasso'); break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [painting.handleToolChange, undoRedo.handleUndo, undoRedo.handleRedo, save.handleSaveAll, draft.handleSaveDraft, viewport.handleToggleHoverInspect, voronoi.pickingGenerator, voronoi.handleGeneratorCancelPicking, lasso.selectedProvinces, lasso.clearSelection, colorPicking.setPickingEmpty, colorPicking.setPickingLock, colorPicking.setPickingColor]);

  // Guard against closing with unsaved draft changes
  useEffect(() => {
    const cleanup = window.mapPainter.onCheckBeforeClose(() => {
      if (!draft.draftDirtyRef.current) {
        window.mapPainter.confirmClose();
      } else {
        draft.pendingNavigationRef.current = () => window.mapPainter.confirmClose();
        draft.guardUnsavedDraft(() => window.mapPainter.confirmClose());
      }
    });
    return cleanup;
  }, [draft.draftDirtyRef, draft.pendingNavigationRef, draft.guardUnsavedDraft]);

  /* ── Derived values ────────────────────────────────────────── */

  const pixelColor = (viewport.cursorPos && engineRef.current?.isLoaded())
    ? engineRef.current!.getPixel(viewport.cursorPos.gx, viewport.cursorPos.gy)
    : null;

  const tm = toolManagerRef.current;
  const mapLoaded = engineRef.current?.isLoaded() ?? false;

  const tabs: { key: typeof inspector.sidebarMode; label: string }[] = [
    { key: 'painting', label: 'Paint' },
    { key: 'inspector', label: `Inspect${inspector.modDirty ? ' *' : ''}` },
    { key: 'creator', label: 'Create' },
    { key: 'pending', label: `Pending${pending.pendingCount > 0 ? ` (${pending.pendingCount})` : ''}` },
  ];
  const activeTabIndex = tabs.findIndex(t => t.key === inspector.sidebarMode);

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', userSelect: 'none', background: theme.bg.base }}>
      <Toolbar
        onOpenMap={mapLoader.handleOpenMap}
        onSaveAll={save.handleSaveAll}
        onSaveDraft={draft.handleSaveDraft}
        onLoadDraft={draft.handleLoadDraft}
        mapLoaded={mapLoaded}
        loading={mapLoader.loading}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <VerticalToolBar
          activeTool={painting.activeTool}
          onToolChange={painting.handleToolChange}
          onUndo={undoRedo.handleUndo}
          onRedo={undoRedo.handleRedo}
          canUndo={tm?.canUndo ?? false}
          canRedo={tm?.canRedo ?? false}
          brushRadius={painting.brushRadius}
          onBrushRadiusChange={painting.handleBrushRadiusChange}
          respectBorders={painting.respectBorders}
          onToggleRespectBorders={painting.handleToggleRespectBorders}
          pickingEmpty={colorPicking.pickingEmpty}
          onDefineEmpty={colorPicking.handleDefineEmpty}
          emptyColors={colorPicking.emptyColors}
          onRemoveEmpty={colorPicking.handleRemoveEmpty}
          pickingLock={colorPicking.pickingLock}
          onTogglePickLock={colorPicking.handleTogglePickLock}
          lockedColor={colorPicking.lockedColor}
          onClearLock={colorPicking.handleClearLock}
          pickingColor={colorPicking.pickingColor}
          onTogglePickColor={colorPicking.handleTogglePickColor}
          gridEnabled={viewport.gridEnabled}
          onToggleGrid={viewport.handleToggleGrid}
          hoverInspect={viewport.hoverInspect}
          onToggleHoverInspect={viewport.handleToggleHoverInspect}
          heightmapVisible={viewport.heightmapVisible}
          heightmapAvailable={viewport.heightmapAvailable}
          heightmapOpacity={viewport.heightmapOpacity}
          onToggleHeightmap={viewport.handleToggleHeightmap}
          onHeightmapOpacityChange={viewport.handleHeightmapOpacityChange}
          mapLoaded={mapLoaded}
        />

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <MainCanvas
            onEngineReady={handleEngineReady}
            onCursorMove={viewport.handleCursorMove}
            onZoomChange={viewport.handleZoomChange}
            toolManagerRef={toolManagerRef}
            pickingEmpty={colorPicking.pickingEmpty}
            onPickEmpty={colorPicking.handlePickEmpty}
            pickingLock={colorPicking.pickingLock}
            onPickLock={colorPicking.handlePickLock}
            pickingColor={colorPicking.pickingColor}
            onPickColor={colorPicking.handlePickColor}
            inspectorMode={inspector.sidebarMode === 'inspector'}
            onProvinceClick={inspector.handleProvinceClick}
            hoverInspect={viewport.hoverInspect}
            registryRef={registryRef}
            pickingGenerator={voronoi.pickingGenerator}
            onPickGenerator={voronoi.handleGeneratorPick}
            lassoActive={painting.activeTool === 'lasso'}
            onLassoComplete={lasso.handleLassoComplete}
            onLassoShiftClick={lasso.handleLassoShiftClick}
          />

          <SelectionActionBar
            selectedCount={lasso.selectedProvinces.size}
            onHarmonize={lasso.handleHarmonize}
            onClear={lasso.clearSelection}
            harmonizing={lasso.harmonizing}
          />

          <SectorMapDrawer registryRef={registryRef} />
        </div>

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
                onClick={() => inspector.setSidebarMode(tab.key)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  background: 'transparent',
                  color: inspector.sidebarMode === tab.key ? theme.text.primary : theme.text.muted,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: theme.font.sizeMd,
                  fontFamily: theme.font.family,
                  fontWeight: inspector.sidebarMode === tab.key ? 600 : 400,
                  transition: theme.transition.fast,
                }}
              >
                {tab.label}
              </button>
            ))}
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
            <div style={{ display: inspector.sidebarMode === 'painting' ? 'block' : 'none' }}>
              <ColorPicker
                color={painting.activeColor}
                onChange={painting.handleColorChange}
                registry={registryRef.current}
              />

              <div style={{ borderTop: `1px solid ${theme.border.muted}`, margin: `${theme.space.lg}px 0` }} />

              <ProvinceSearch
                registry={registryRef.current}
                onJumpToProvince={inspector.handleJumpToProvince}
              />

              <div style={{ borderTop: `1px solid ${theme.border.muted}`, margin: `${theme.space.lg}px 0` }} />

              <h3 style={{
                color: theme.text.primary,
                margin: '0 0 8px',
                fontSize: theme.font.sizeXl,
                fontWeight: 600,
                letterSpacing: '-0.2px',
              }}>Hover Inspector</h3>
              {viewport.cursorPos && engineRef.current?.isLoaded() ? (
                (() => {
                  const px = engineRef.current!.getPixel(viewport.cursorPos.gx, viewport.cursorPos.gy);
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

            <div style={{ display: inspector.sidebarMode === 'inspector' ? 'block' : 'none' }}>
              <ProvinceInspector
                province={inspector.selectedProvince}
                pixelColor={pixelColor}
                onFetchHierarchy={inspector.handleFetchHierarchy}
                onProvinceEdit={inspector.handleProvinceEdit}
                onTitleRename={inspector.handleTitleRename}
                onSave={inspector.handleSaveMod}
                isDirty={inspector.modDirty}
                modLoaded={inspector.modLoaded}
              />
            </div>

            <div style={{ display: inspector.sidebarMode === 'creator' ? 'block' : 'none' }}>
              <ProvinceCreator
                activeColor={painting.activeColor}
                landedTitles={inspector.landedTitles}
                onCreate={pending.handleCreateProvince}
                modLoaded={inspector.modLoaded}
                historyFiles={inspector.historyFiles}
                editingProvince={pending.editingPendingKey ? pendingMapRef.current.get(pending.editingPendingKey) ?? null : null}
                onUpdate={pending.handleUpdatePending}
                onCancelEdit={() => pending.setEditingPendingKey(null)}
              />

              <div style={{ borderTop: `1px solid ${theme.border.muted}`, margin: `${theme.space.lg}px 0` }} />

              <ProvinceGenerator
                modLoaded={inspector.modLoaded}
                engineRef={engineRef}
                registryRef={registryRef}
                onStartPicking={voronoi.handleGeneratorStartPicking}
                onCancelPicking={voronoi.handleGeneratorCancelPicking}
                pickingGenerator={voronoi.pickingGenerator}
                pickedProvince={voronoi.generatorPickedProvince}
                onConfirm={voronoi.handleGeneratorConfirm}
                onOverlayChange={voronoi.handleOverlayChange}
              />
            </div>

            <div style={{ display: inspector.sidebarMode === 'pending' ? 'block' : 'none' }}>
              <PendingProvinces
                pendingMap={pendingMapRef.current}
                onDelete={pending.handleDeletePending}
                onEdit={pending.handleEditPending}
                modLoaded={inspector.modLoaded}
                saveOptions={pending.pendingSaveOptions}
                onSaveOptionsChange={pending.setPendingSaveOptions}
              />
            </div>
          </div>
        </div>
      </div>

      <StatusBar
        cursorPos={viewport.cursorPos}
        zoomLevel={viewport.zoomLevel}
        status={status}
        activeTool={painting.activeTool}
        activeColor={painting.activeColor}
        provinceCount={pending.provinceCount}
      />

      {save.showReconcileDialog && (
        <ReconcileDialog
          orphanedProvinces={save.reconcileOrphans}
          orphanedParents={save.reconcileParents}
          onConfirm={save.handleReconcileConfirm}
          onCancel={save.handleReconcileCancel}
        />
      )}

      {save.showDriftDialog && save.driftRemaps.length > 0 && (
        <IdDriftDialog
          remaps={save.driftRemaps}
          onConfirm={save.handleDriftConfirm}
          onCancel={save.handleDriftCancel}
        />
      )}

      {pending.showPendingOrphanDialog && pending.pendingOrphans.length > 0 && (
        <PendingOrphanDialog
          orphanedEntries={pending.pendingOrphans}
          onConfirm={pending.handlePendingOrphanConfirm}
          onCancel={pending.handlePendingOrphanCancel}
        />
      )}

      {draft.showSaveDraftDialog && (
        <SaveDraftDialog
          onSave={draft.handleSaveDraftConfirm}
          onCancel={draft.handleSaveDraftCancel}
          defaultName={draft.draftLoadedName ?? undefined}
        />
      )}

      {draft.showDraftListDialog && draft.draftList.length > 0 && (
        <DraftListDialog
          drafts={draft.draftList}
          onSelect={draft.handleDraftSelected}
          onDelete={draft.handleDraftDelete}
          onCancel={draft.handleDraftListCancel}
        />
      )}

      {draft.showUnsavedDraftDialog && (
        <UnsavedDraftDialog
          onSaveDraft={draft.handleUnsavedSave}
          onDiscard={draft.handleUnsavedDiscard}
          onCancel={draft.handleUnsavedCancel}
        />
      )}

      {mapLoader.loadingMessage && (
        <LoadingOverlay message={mapLoader.loadingMessage} />
      )}
    </div>
  );
}
