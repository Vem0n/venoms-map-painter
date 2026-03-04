/** Color picking modes: empty, lock, and eyedropper */

import { useState, useCallback } from 'react';
import type { RGB } from '@shared/types';
import type { ToolManagerRef } from './types';

export interface UseColorPickingParams {
  toolManagerRef: ToolManagerRef;
  setStatus: (msg: string) => void;
  onPickColor: (color: RGB) => void;
  triggerForceUpdate: () => void;
}

export function useColorPicking({ toolManagerRef, setStatus, onPickColor, triggerForceUpdate }: UseColorPickingParams) {
  const [pickingEmpty, setPickingEmpty] = useState(false);
  const [emptyColors, setEmptyColors] = useState<RGB[]>([{ r: 0, g: 0, b: 0 }]);
  const [pickingLock, setPickingLock] = useState(false);
  const [pickingColor, setPickingColor] = useState(false);
  const [lockedColor, setLockedColor] = useState<RGB | null>(null);

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
    triggerForceUpdate();
  }, [toolManagerRef, setStatus, triggerForceUpdate]);

  const handleRemoveEmpty = useCallback((color: RGB) => {
    const tm = toolManagerRef.current;
    if (!tm) return;
    tm.removeEmptyColor(color);
    setEmptyColors(tm.getEmptyColors());
    setStatus(`Removed empty color: (${color.r}, ${color.g}, ${color.b})`);
    triggerForceUpdate();
  }, [toolManagerRef, setStatus, triggerForceUpdate]);

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
  }, [toolManagerRef, setStatus]);

  const handleClearLock = useCallback(() => {
    const tm = toolManagerRef.current;
    if (!tm) return;
    tm.setLockedColor(null);
    setLockedColor(null);
    setStatus('Province lock cleared');
  }, [toolManagerRef, setStatus]);

  const handleTogglePickColor = useCallback(() => {
    setPickingColor(prev => !prev);
    setPickingEmpty(false);
    setPickingLock(false);
  }, []);

  const handlePickColor = useCallback((color: RGB) => {
    onPickColor(color);
    setPickingColor(false);
    setStatus(`Active color set to: (${color.r}, ${color.g}, ${color.b})`);
  }, [onPickColor, setStatus]);

  return {
    pickingEmpty, emptyColors, pickingLock, lockedColor, pickingColor,
    handleDefineEmpty, handlePickEmpty, handleRemoveEmpty,
    handleTogglePickLock, handlePickLock, handleClearLock,
    handleTogglePickColor, handlePickColor,
    setPickingEmpty, setPickingLock, setPickingColor,
    setEmptyColors, setLockedColor,
  };
}
