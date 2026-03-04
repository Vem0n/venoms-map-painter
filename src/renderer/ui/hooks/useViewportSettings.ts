/** Viewport state: cursor, zoom, grid, hover inspect, heightmap overlay */

import { useState, useCallback } from 'react';
import type { EngineRef } from './types';

export interface UseViewportSettingsParams {
  engineRef: EngineRef;
}

export function useViewportSettings({ engineRef }: UseViewportSettingsParams) {
  const [cursorPos, setCursorPos] = useState<{ gx: number; gy: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [hoverInspect, setHoverInspect] = useState(false);
  const [heightmapVisible, setHeightmapVisible] = useState(false);
  const [heightmapOpacity, setHeightmapOpacity] = useState(0.5);
  const [heightmapAvailable, setHeightmapAvailable] = useState(false);

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
  }, [engineRef]);

  const handleToggleHoverInspect = useCallback(() => {
    setHoverInspect(prev => !prev);
  }, []);

  const handleToggleHeightmap = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isHeightmapLoaded()) return;
    const next = !engine.isHeightmapVisible();
    engine.setHeightmapVisible(next);
    setHeightmapVisible(next);
  }, [engineRef]);

  const handleHeightmapOpacityChange = useCallback((opacity: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setHeightmapOpacity(opacity);
    setHeightmapOpacity(opacity);
  }, [engineRef]);

  return {
    cursorPos, zoomLevel, gridEnabled, hoverInspect,
    heightmapVisible, heightmapOpacity, heightmapAvailable,
    handleCursorMove, handleZoomChange, handleToggleGrid, handleToggleHoverInspect,
    handleToggleHeightmap, handleHeightmapOpacityChange,
    setHeightmapAvailable, setHeightmapVisible, setZoomLevel,
  };
}
