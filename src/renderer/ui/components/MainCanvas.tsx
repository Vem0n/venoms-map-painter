/**
 * MainCanvas — Container for the WebGL2 canvas.
 *
 * React manages the container div. The actual canvas and WebGL context
 * are managed imperatively by TileEngine.
 *
 * Handles: mouse events (pan with middle/right click, zoom with wheel),
 * paint events (left click dispatches to ToolManager), resize.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { TileEngine } from '@engine/tile-engine';
import type { ToolManager } from '@tools/tool-manager';
import type { ColorRegistry } from '@registry/color-registry';
import type { RGB } from '@shared/types';
import type { LassoPoint } from '@tools/lasso-select';
import { theme } from '../theme';

export interface MainCanvasProps {
  onEngineReady: (engine: TileEngine) => void;
  onCursorMove: (gx: number, gy: number) => void;
  onZoomChange: (zoom: number) => void;
  toolManagerRef: React.RefObject<ToolManager | null>;
  /** When true, next left click picks a color instead of painting */
  pickingEmpty?: boolean;
  /** Called when a color is picked in picking mode */
  onPickEmpty?: (color: { r: number; g: number; b: number }) => void;
  /** When true, next left click picks a color for province lock */
  pickingLock?: boolean;
  /** Called when a color is picked for province lock */
  onPickLock?: (color: { r: number; g: number; b: number }) => void;
  /** When true, next left click picks a color to set as active paint color */
  pickingColor?: boolean;
  /** Called when a color is picked via eyedropper */
  onPickColor?: (color: { r: number; g: number; b: number }) => void;
  /** When true, left click selects a province instead of painting */
  inspectorMode?: boolean;
  /** Called when a province is clicked in inspector mode */
  onProvinceClick?: (gx: number, gy: number) => void;
  /** When true, show province info tooltip on hover */
  hoverInspect?: boolean;
  /** Color registry ref for looking up province data */
  registryRef?: React.RefObject<ColorRegistry>;
  /** When true, next left click picks a province for the Voronoi generator */
  pickingGenerator?: boolean;
  /** Called when a color is picked for the generator */
  onPickGenerator?: (color: RGB) => void;
  /** When true, lasso multi-select is active */
  lassoActive?: boolean;
  /** Called when lasso polygon is completed (mouseup with >=3 points) */
  onLassoComplete?: (polygon: LassoPoint[]) => void;
  /** Called on shift+click during lasso mode for single-province toggle */
  onLassoShiftClick?: (gx: number, gy: number) => void;
  /** When true, paste mode is active — left drag moves the paste preview */
  pasteMode?: boolean;
  /** Called with world-space delta when user drags during paste mode */
  onPasteDrag?: (worldDx: number, worldDy: number) => void;
  /** Called with wheel delta (+1/-1) during paste mode when Ctrl is held */
  onPasteWheel?: (delta: number) => void;
}

export default function MainCanvas({ onEngineReady, onCursorMove, onZoomChange, toolManagerRef, pickingEmpty, onPickEmpty, pickingLock, onPickLock, pickingColor, onPickColor, inspectorMode, onProvinceClick, hoverInspect, registryRef, pickingGenerator, onPickGenerator, lassoActive, onLassoComplete, onLassoShiftClick, pasteMode, onPasteDrag, onPasteWheel }: MainCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TileEngine | null>(null);
  const isPanningRef = useRef(false);
  const isPaintingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Lasso drawing state
  const isLassoDrawingRef = useRef(false);
  const lassoPointsRef = useRef<LassoPoint[]>([]);
  const lassoCanvasRef = useRef<HTMLCanvasElement>(null);

  // Paste drag state
  const isPasteDraggingRef = useRef(false);
  const lastPasteMouseRef = useRef({ x: 0, y: 0 });

  // Refs for paste mode wheel interception (used by imperative wheel handler)
  const pasteModeRef = useRef(pasteMode);
  pasteModeRef.current = pasteMode;
  const onPasteWheelRef = useRef(onPasteWheel);
  onPasteWheelRef.current = onPasteWheel;

  // Hover inspect tooltip state
  const [tooltipData, setTooltipData] = useState<{
    screenX: number; screenY: number;
    color: RGB;
    province: { id: number; name: string; titleKey?: string; culture?: string; religion?: string } | null;
  } | null>(null);

  /** Draw lasso outline on the 2D overlay canvas */
  const drawLassoOutline = useCallback((points: LassoPoint[]) => {
    const lc = lassoCanvasRef.current;
    const engine = engineRef.current;
    if (!lc || !engine || points.length < 2) return;

    const ctx = lc.getContext('2d');
    if (!ctx) return;

    const { offsetX, offsetY, zoom } = engine.getCamera();
    ctx.clearRect(0, 0, lc.width, lc.height);

    ctx.beginPath();
    const sx = (points[0].x - offsetX) * zoom;
    const sy = (points[0].y - offsetY) * zoom;
    ctx.moveTo(sx, sy);

    for (let i = 1; i < points.length; i++) {
      const px = (points[i].x - offsetX) * zoom;
      const py = (points[i].y - offsetY) * zoom;
      ctx.lineTo(px, py);
    }

    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();

    // Light fill to show the lasso area
    ctx.fillStyle = 'rgba(88, 166, 255, 0.1)';
    ctx.fill();
  }, []);

  /** Clear lasso overlay canvas */
  const clearLassoCanvas = useCallback(() => {
    const lc = lassoCanvasRef.current;
    if (!lc) return;
    const ctx = lc.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, lc.width, lc.height);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Size the canvas to match the container
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Size the lasso overlay canvas too
    const lc = lassoCanvasRef.current;
    if (lc) {
      lc.width = rect.width;
      lc.height = rect.height;
    }

    // Initialize TileEngine
    const engine = new TileEngine(canvas);
    engineRef.current = engine;
    onEngineReady(engine);
    engine.startRenderLoop();

    // Wheel handler — must be registered imperatively with { passive: false }
    // so we can call preventDefault() without Chrome warnings
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault();

      // Ctrl+wheel during paste mode → fine-grained scale/rotation adjustment
      if (pasteModeRef.current && e.ctrlKey && onPasteWheelRef.current) {
        const delta = e.deltaY < 0 ? 1 : -1;
        onPasteWheelRef.current(delta);
        return;
      }

      const canvasRect = canvas.getBoundingClientRect();
      const screenX = e.clientX - canvasRect.left;
      const screenY = e.clientY - canvasRect.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      engine.zoomAt(factor, screenX, screenY);
      onZoomChange(engine.getZoom());
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    // ResizeObserver to keep canvas sized correctly
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          engine.resize(width, height);
          // Also resize lasso overlay canvas
          const lc = lassoCanvasRef.current;
          if (lc) {
            lc.width = width;
            lc.height = height;
          }
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      resizeObserver.disconnect();
    };
  }, [onEngineReady, onZoomChange]);

  /** Get global coords from a mouse event */
  const getGlobalCoords = useCallback((e: React.MouseEvent): { gx: number; gy: number } | null => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return engine.screenToGlobal(e.clientX - rect.left, e.clientY - rect.top);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle mouse button (1) or right button (2) starts panning
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      isPanningRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Left button (0)
    if (e.button === 0) {
      const coords = getGlobalCoords(e);
      if (!coords) return;

      // Paste mode: left click starts drag
      if (pasteMode && onPasteDrag) {
        isPasteDraggingRef.current = true;
        lastPasteMouseRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Lasso mode: draw polygon or shift+click toggle
      if (lassoActive) {
        if (e.shiftKey && onLassoShiftClick) {
          onLassoShiftClick(coords.gx, coords.gy);
          return;
        }
        // Start lasso drawing
        isLassoDrawingRef.current = true;
        lassoPointsRef.current = [{ x: coords.gx, y: coords.gy }];
        return;
      }

      // Generator picking mode: sample color for Voronoi subdivision
      if (pickingGenerator && onPickGenerator) {
        const engine = engineRef.current;
        if (engine && engine.isLoaded()) {
          const color = engine.getPixel(coords.gx, coords.gy);
          onPickGenerator(color);
        }
        return;
      }

      // Picking modes: sample color from map instead of painting
      if (pickingEmpty && onPickEmpty) {
        const engine = engineRef.current;
        if (engine && engine.isLoaded()) {
          const color = engine.getPixel(coords.gx, coords.gy);
          onPickEmpty(color);
        }
        return;
      }

      if (pickingLock && onPickLock) {
        const engine = engineRef.current;
        if (engine && engine.isLoaded()) {
          const color = engine.getPixel(coords.gx, coords.gy);
          onPickLock(color);
        }
        return;
      }

      if (pickingColor && onPickColor) {
        const engine = engineRef.current;
        if (engine && engine.isLoaded()) {
          const color = engine.getPixel(coords.gx, coords.gy);
          onPickColor(color);
        }
        return;
      }

      // Inspector mode: click selects a province instead of painting
      if (inspectorMode && onProvinceClick) {
        onProvinceClick(coords.gx, coords.gy);
        return;
      }

      const tm = toolManagerRef.current;
      if (!tm) return;

      const tool = tm.getTool();
      if (tool === 'flood-fill') {
        // Flood fill on single click
        tm.handlePaint(coords.gx, coords.gy);
      } else {
        // Brush/eraser: start drag
        isPaintingRef.current = true;
        tm.handleDragStart(coords.gx, coords.gy);
      }
    }
  }, [getGlobalCoords, toolManagerRef, pickingEmpty, onPickEmpty, pickingLock, onPickLock, pickingColor, onPickColor, inspectorMode, onProvinceClick, pickingGenerator, onPickGenerator, lassoActive, onLassoShiftClick, pasteMode, onPasteDrag]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const engine = engineRef.current;
    if (!engine) return;

    // Update cursor position in global coords
    const coords = getGlobalCoords(e);
    if (coords) {
      onCursorMove(coords.gx, coords.gy);
    }

    // Update hover inspect tooltip
    if (hoverInspect && coords && engine.isLoaded() && registryRef?.current) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const color = engine.getPixel(coords.gx, coords.gy);
        const province = registryRef.current.getProvinceByColor(color);
        setTooltipData({
          screenX: e.clientX - rect.left,
          screenY: e.clientY - rect.top,
          color,
          province: province ? { id: province.id, name: province.name, titleKey: province.titleKey, culture: province.culture, religion: province.religion } : null,
        });
      }
    } else if (!hoverInspect) {
      setTooltipData(null);
    }

    // Handle paste dragging
    if (isPasteDraggingRef.current && onPasteDrag) {
      const engine = engineRef.current;
      if (engine) {
        const dx = e.clientX - lastPasteMouseRef.current.x;
        const dy = e.clientY - lastPasteMouseRef.current.y;
        // Convert screen delta to world delta
        const worldDx = dx / engine.getZoom();
        const worldDy = dy / engine.getZoom();
        onPasteDrag(worldDx, worldDy);
        lastPasteMouseRef.current = { x: e.clientX, y: e.clientY };
      }
      return;
    }

    // Handle lasso drawing
    if (isLassoDrawingRef.current && coords) {
      const points = lassoPointsRef.current;
      const last = points[points.length - 1];
      const dx = coords.gx - last.x;
      const dy = coords.gy - last.y;
      // Only add point if moved at least 2px to reduce density
      if (dx * dx + dy * dy >= 4) {
        points.push({ x: coords.gx, y: coords.gy });
        drawLassoOutline(points);
      }
      return;
    }

    // Handle panning
    if (isPanningRef.current) {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      engine.pan(dx, dy);
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Handle paint drag
    if (isPaintingRef.current && coords) {
      const tm = toolManagerRef.current;
      if (tm) {
        tm.handleDragMove(coords.gx, coords.gy);
      }
    }
  }, [onCursorMove, getGlobalCoords, toolManagerRef, hoverInspect, registryRef, drawLassoOutline, onPasteDrag]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2) {
      isPanningRef.current = false;
    }

    // Paste drag complete
    if (e.button === 0 && isPasteDraggingRef.current) {
      isPasteDraggingRef.current = false;
      return;
    }

    // Lasso complete
    if (e.button === 0 && isLassoDrawingRef.current) {
      isLassoDrawingRef.current = false;
      clearLassoCanvas();
      const points = lassoPointsRef.current;
      lassoPointsRef.current = [];

      if (points.length >= 3 && onLassoComplete) {
        onLassoComplete(points);
      } else if (points.length < 3 && onLassoShiftClick) {
        // Tiny drag or single click — treat as single-province toggle
        const coords = getGlobalCoords(e);
        if (coords) {
          onLassoShiftClick(coords.gx, coords.gy);
        }
      }
      return;
    }

    if (e.button === 0 && isPaintingRef.current) {
      isPaintingRef.current = false;
      const tm = toolManagerRef.current;
      if (tm) {
        tm.handleDragEnd();
      }
    }
  }, [toolManagerRef, onLassoComplete, onLassoShiftClick, getGlobalCoords, clearLassoCanvas]);

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false;
    isPasteDraggingRef.current = false;
    setTooltipData(null);
    // Cancel lasso drawing on leave
    if (isLassoDrawingRef.current) {
      isLassoDrawingRef.current = false;
      lassoPointsRef.current = [];
      clearLassoCanvas();
    }
    if (isPaintingRef.current) {
      isPaintingRef.current = false;
      const tm = toolManagerRef.current;
      if (tm) {
        tm.handleDragEnd();
      }
    }
  }, [toolManagerRef, clearLassoCanvas]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#010409', cursor: pasteMode ? 'move' : (pickingEmpty || pickingLock || pickingColor || pickingGenerator) ? 'copy' : inspectorMode ? 'pointer' : 'crosshair' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      />

      {/* Lasso drawing overlay — transparent 2D canvas on top of WebGL */}
      <canvas
        ref={lassoCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* Hover Inspect tooltip */}
      {hoverInspect && tooltipData && (
        <div style={{
          position: 'absolute',
          left: tooltipData.screenX + 16,
          top: tooltipData.screenY + 16,
          background: theme.bg.elevated,
          border: `1px solid ${theme.border.default}`,
          borderRadius: theme.radius.md,
          padding: '8px 10px',
          fontSize: theme.font.sizeSm,
          color: theme.text.primary,
          pointerEvents: 'none',
          zIndex: 1000,
          boxShadow: theme.shadow.tooltip,
          maxWidth: 220,
          whiteSpace: 'nowrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{
              width: 12, height: 12, borderRadius: theme.radius.sm,
              border: `1px solid ${theme.border.default}`,
              background: `rgb(${tooltipData.color.r},${tooltipData.color.g},${tooltipData.color.b})`,
              flexShrink: 0,
            }} />
            <span style={{ color: theme.text.secondary, fontFamily: theme.font.mono, fontSize: theme.font.sizeXs }}>
              ({tooltipData.color.r}, {tooltipData.color.g}, {tooltipData.color.b})
            </span>
          </div>
          {tooltipData.province ? (
            <div style={{ color: theme.text.secondary, lineHeight: 1.5 }}>
              <div>ID: {tooltipData.province.id}</div>
              <div>Name: {tooltipData.province.name}</div>
              {tooltipData.province.titleKey && <div>Title: {tooltipData.province.titleKey}</div>}
              {tooltipData.province.culture && <div>Culture: {tooltipData.province.culture}</div>}
              {tooltipData.province.religion && <div>Religion: {tooltipData.province.religion}</div>}
            </div>
          ) : (
            <div style={{ color: theme.text.muted }}>
              {tooltipData.color.r === 0 && tooltipData.color.g === 0 && tooltipData.color.b === 0 ? 'Unassigned (ocean)' : 'No province data'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
