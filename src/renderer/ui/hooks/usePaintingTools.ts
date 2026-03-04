/** Painting tool state: active tool, color, brush size, border respect */

import { useState, useCallback } from 'react';
import type { ToolType, RGB } from '@shared/types';
import type { ToolManagerRef } from './types';

export interface UsePaintingToolsParams {
  toolManagerRef: ToolManagerRef;
  onBeforeToolChange?: (oldTool: ToolType, newTool: ToolType) => void;
}

export function usePaintingTools({ toolManagerRef, onBeforeToolChange }: UsePaintingToolsParams) {
  const [activeTool, setActiveTool] = useState<ToolType>('flood-fill');
  const [activeColor, setActiveColor] = useState<RGB>({ r: 255, g: 0, b: 0 });
  const [brushRadius, setBrushRadius] = useState(3);
  const [respectBorders, setRespectBorders] = useState(true);

  const handleToolChange = useCallback((tool: ToolType) => {
    setActiveTool(prev => {
      if (onBeforeToolChange) onBeforeToolChange(prev, tool);
      return tool;
    });
    toolManagerRef.current?.setTool(tool);
  }, [toolManagerRef, onBeforeToolChange]);

  const handleColorChange = useCallback((color: RGB) => {
    setActiveColor(color);
    toolManagerRef.current?.setColor(color);
  }, [toolManagerRef]);

  const handleBrushRadiusChange = useCallback((radius: number) => {
    setBrushRadius(radius);
    toolManagerRef.current?.setBrushRadius(radius);
  }, [toolManagerRef]);

  const handleToggleRespectBorders = useCallback(() => {
    const tm = toolManagerRef.current;
    if (!tm) return;
    const newValue = !tm.getRespectBorders();
    tm.setRespectBorders(newValue);
    setRespectBorders(newValue);
  }, [toolManagerRef]);

  return {
    activeTool, activeColor, brushRadius, respectBorders,
    handleToolChange, handleColorChange, handleBrushRadiusChange, handleToggleRespectBorders,
    setActiveColor,
  };
}
