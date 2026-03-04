/**
 * VerticalToolBar — Photoshop-style vertical icon toolbar on the left side.
 *
 * Icon buttons with tooltips, grouped by function.
 * Paint tools (top) → toggles (middle) → undo/redo (bottom).
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { ToolType, RGB } from '@shared/types';
import { theme } from '../theme';
import {
  FloodFillIcon, BrushIcon, EraserIcon, EyedropperIcon, LassoIcon,
  BordersIcon, CircleIcon, LockIcon, LockOpenIcon, GridIcon, InspectIcon,
  HeightmapIcon, UndoIcon, RedoIcon, XIcon,
} from './icons';

interface VerticalToolBarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  brushRadius: number;
  onBrushRadiusChange: (radius: number) => void;
  respectBorders: boolean;
  onToggleRespectBorders: () => void;
  pickingEmpty: boolean;
  onDefineEmpty: () => void;
  emptyColors: RGB[];
  onRemoveEmpty: (color: RGB) => void;
  pickingLock: boolean;
  onTogglePickLock: () => void;
  lockedColor: RGB | null;
  onClearLock: () => void;
  pickingColor: boolean;
  onTogglePickColor: () => void;
  gridEnabled: boolean;
  onToggleGrid: () => void;
  hoverInspect: boolean;
  onToggleHoverInspect: () => void;
  heightmapVisible: boolean;
  heightmapAvailable: boolean;
  heightmapOpacity: number;
  onToggleHeightmap: () => void;
  onHeightmapOpacityChange: (opacity: number) => void;
  mapLoaded: boolean;
}

/* ── ToolButton ─────────────────────────────────────── */

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  active?: boolean;
  toggled?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolButton({ icon, label, shortcut, active, toggled, disabled, onClick }: ToolButtonProps) {
  const [hover, setHover] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleEnter = useCallback(() => {
    setHover(true);
    timerRef.current = setTimeout(() => setShowTooltip(true), 400);
  }, []);

  const handleLeave = useCallback(() => {
    setHover(false);
    clearTimeout(timerRef.current);
    setShowTooltip(false);
  }, []);

  const isHighlighted = active || toggled;

  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isHighlighted ? theme.toolbar.activeBg : hover ? theme.toolbar.hoverBg : 'transparent',
          border: 'none',
          borderLeft: `3px solid ${isHighlighted ? theme.toolbar.activeBar : 'transparent'}`,
          borderRadius: theme.radius.sm,
          cursor: disabled ? 'default' : 'pointer',
          color: isHighlighted ? theme.accent.blue : hover ? theme.text.primary : theme.text.secondary,
          transition: theme.transition.fast,
          opacity: disabled ? 0.35 : 1,
          padding: 0,
          margin: '1px 4px',
        }}
      >
        {icon}
      </button>

      {showTooltip && !disabled && (
        <div style={{
          position: 'absolute',
          left: 44,
          top: '50%',
          transform: 'translateY(-50%)',
          background: theme.bg.elevated,
          color: theme.text.primary,
          border: `1px solid ${theme.border.default}`,
          borderRadius: theme.radius.sm,
          padding: '4px 8px',
          fontSize: theme.font.sizeSm,
          whiteSpace: 'nowrap',
          boxShadow: theme.shadow.tooltip,
          zIndex: 1000,
          pointerEvents: 'none',
        }}>
          {label}
          {shortcut && (
            <span style={{ color: theme.text.muted, marginLeft: 6 }}>{shortcut}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Separator ──────────────────────────────────────── */

function Separator() {
  return (
    <div style={{
      height: 1,
      background: theme.border.default,
      margin: '4px 8px',
    }} />
  );
}

/* ── BrushSizeFlyout ───────────────────────────────── */

function BrushSizeFlyout({ brushRadius, onBrushRadiusChange }: {
  brushRadius: number;
  onBrushRadiusChange: (r: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Animate in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const isVisible = hovered || dragging;

  const handleEnter = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    setHovered(true);
  }, []);

  const handleLeave = useCallback(() => {
    // Small delay so moving between trigger and panel doesn't flicker
    hideTimerRef.current = setTimeout(() => setHovered(false), 200);
  }, []);

  // Track drag state so the panel stays open while sliding
  const handlePointerDown = useCallback(() => setDragging(true), []);
  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragging]);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* Trigger — small size indicator inside the toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '2px 4px',
        padding: '4px 0',
        cursor: 'pointer',
        borderRadius: theme.radius.sm,
        background: isVisible ? theme.toolbar.hoverBg : 'transparent',
        transition: theme.transition.fast,
      }}>
        {/* Preview dot that scales with brush radius */}
        <div style={{
          width: Math.max(4, Math.min(20, brushRadius * 0.8 + 4)),
          height: Math.max(4, Math.min(20, brushRadius * 0.8 + 4)),
          borderRadius: '50%',
          background: theme.text.secondary,
          transition: theme.transition.fast,
        }} />
      </div>

      {/* Floating panel — slides out to the right */}
      <div style={{
        position: 'absolute',
        left: 40,
        top: '50%',
        transform: `translateY(-50%) translateX(${mounted && isVisible ? '0px' : '-8px'})`,
        opacity: mounted && isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
        zIndex: 1000,
      }}>
        <div style={{
          background: theme.bg.elevated,
          border: `1px solid ${theme.border.default}`,
          borderRadius: theme.radius.md,
          boxShadow: theme.shadow.dropdown,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          whiteSpace: 'nowrap',
        }}>
          <div style={{
            color: theme.text.muted,
            fontSize: theme.font.sizeXs,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            flexShrink: 0,
          }}>
            Size
          </div>

          <input
            type="range"
            min={0} max={50}
            value={brushRadius}
            onChange={e => onBrushRadiusChange(parseInt(e.target.value, 10))}
            onPointerDown={handlePointerDown}
            style={{ width: 120, display: 'block', cursor: 'pointer' }}
          />

          <div style={{
            color: theme.text.primary,
            fontSize: theme.font.sizeMd,
            fontFamily: theme.font.mono,
            fontWeight: 600,
            minWidth: 28,
            textAlign: 'right',
          }}>
            {brushRadius === 0 ? '1px' : `${brushRadius}px`}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── HeightmapOpacityFlyout ─────────────────────────── */

function HeightmapOpacityFlyout({ opacity, onOpacityChange }: {
  opacity: number;
  onOpacityChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const isVisible = hovered || dragging;

  const handleEnter = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    setHovered(true);
  }, []);

  const handleLeave = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setHovered(false), 200);
  }, []);

  const handlePointerDown = useCallback(() => setDragging(true), []);
  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragging]);

  const pct = Math.round(opacity * 100);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {/* Trigger — small opacity indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '2px 4px',
        padding: '4px 0',
        cursor: 'pointer',
        borderRadius: theme.radius.sm,
        background: isVisible ? theme.toolbar.hoverBg : 'transparent',
        transition: theme.transition.fast,
      }}>
        <div style={{
          width: 20,
          fontSize: 8,
          fontWeight: 600,
          fontFamily: theme.font.mono,
          color: theme.text.secondary,
          textAlign: 'center',
          lineHeight: 1,
        }}>
          {pct}%
        </div>
      </div>

      {/* Floating panel */}
      <div style={{
        position: 'absolute',
        left: 40,
        top: '50%',
        transform: `translateY(-50%) translateX(${mounted && isVisible ? '0px' : '-8px'})`,
        opacity: mounted && isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
        zIndex: 1000,
      }}>
        <div style={{
          background: theme.bg.elevated,
          border: `1px solid ${theme.border.default}`,
          borderRadius: theme.radius.md,
          boxShadow: theme.shadow.dropdown,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          whiteSpace: 'nowrap',
        }}>
          <div style={{
            color: theme.text.muted,
            fontSize: theme.font.sizeXs,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            flexShrink: 0,
          }}>
            Opacity
          </div>

          <input
            type="range"
            min={0} max={100}
            value={pct}
            onChange={e => onOpacityChange(parseInt(e.target.value, 10) / 100)}
            onPointerDown={handlePointerDown}
            style={{ width: 120, display: 'block', cursor: 'pointer' }}
          />

          <div style={{
            color: theme.text.primary,
            fontSize: theme.font.sizeMd,
            fontFamily: theme.font.mono,
            fontWeight: 600,
            minWidth: 32,
            textAlign: 'right',
          }}>
            {pct}%
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main VerticalToolBar ───────────────────────────── */

export default function VerticalToolBar({
  activeTool, onToolChange,
  onUndo, onRedo, canUndo, canRedo,
  brushRadius, onBrushRadiusChange,
  respectBorders, onToggleRespectBorders,
  pickingEmpty, onDefineEmpty, emptyColors, onRemoveEmpty,
  pickingLock, onTogglePickLock, lockedColor, onClearLock,
  pickingColor, onTogglePickColor,
  gridEnabled, onToggleGrid,
  hoverInspect, onToggleHoverInspect,
  heightmapVisible, heightmapAvailable, heightmapOpacity,
  onToggleHeightmap, onHeightmapOpacityChange,
  mapLoaded,
}: VerticalToolBarProps) {
  const showBrushFlyout = (activeTool === 'brush' || activeTool === 'eraser') && mapLoaded;

  return (
    <div style={{
      width: 40,
      background: theme.toolbar.bg,
      borderRight: `1px solid ${theme.border.default}`,
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 4,
      paddingBottom: 4,
      flexShrink: 0,
    }}>
      {/* Paint tools */}
      <ToolButton
        icon={<FloodFillIcon size={16} />}
        label="Flood Fill"
        shortcut="F"
        active={activeTool === 'flood-fill'}
        onClick={() => onToolChange('flood-fill')}
        disabled={!mapLoaded}
      />
      <ToolButton
        icon={<BrushIcon size={16} />}
        label="Brush"
        shortcut="B"
        active={activeTool === 'brush'}
        onClick={() => onToolChange('brush')}
        disabled={!mapLoaded}
      />
      <ToolButton
        icon={<EraserIcon size={16} />}
        label="Eraser"
        shortcut="E"
        active={activeTool === 'eraser'}
        onClick={() => onToolChange('eraser')}
        disabled={!mapLoaded}
      />
      <ToolButton
        icon={<EyedropperIcon size={16} />}
        label={pickingColor ? 'Click map...' : 'Eyedropper'}
        active={pickingColor}
        onClick={onTogglePickColor}
        disabled={!mapLoaded}
      />
      <ToolButton
        icon={<LassoIcon size={16} />}
        label="Lasso Select"
        shortcut="L"
        active={activeTool === 'lasso'}
        onClick={() => onToolChange('lasso')}
        disabled={!mapLoaded}
      />

      <Separator />

      {/* Toggles */}
      <ToolButton
        icon={<BordersIcon size={16} />}
        label={respectBorders ? 'Borders: ON' : 'Borders: OFF'}
        toggled={respectBorders}
        onClick={onToggleRespectBorders}
        disabled={!mapLoaded}
      />
      <ToolButton
        icon={<CircleIcon size={16} />}
        label={pickingEmpty ? 'Click map...' : 'Define Empty'}
        toggled={pickingEmpty}
        onClick={onDefineEmpty}
        disabled={!mapLoaded}
      />
      {emptyColors.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: '2px 6px', justifyContent: 'center' }}>
          {emptyColors.map((c, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <div style={{
                width: 10, height: 10, borderRadius: 2,
                background: `rgb(${c.r},${c.g},${c.b})`,
                border: `1px solid ${theme.border.default}`,
              }} />
              <button
                onClick={() => onRemoveEmpty(c)}
                style={{
                  position: 'absolute', top: -4, right: -4,
                  width: 10, height: 10, borderRadius: '50%',
                  background: theme.accent.red, color: '#fff',
                  border: 'none', fontSize: 7, lineHeight: '10px',
                  cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <XIcon size={6} />
              </button>
            </div>
          ))}
        </div>
      )}
      <ToolButton
        icon={lockedColor ? <LockIcon size={16} /> : <LockOpenIcon size={16} />}
        label={pickingLock ? 'Click map...' : lockedColor ? 'Province Locked' : 'Province Lock'}
        toggled={pickingLock || !!lockedColor}
        onClick={lockedColor ? onClearLock : onTogglePickLock}
        disabled={!mapLoaded}
      />
      {lockedColor && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
          <div style={{
            width: 12, height: 12, borderRadius: 2,
            background: `rgb(${lockedColor.r},${lockedColor.g},${lockedColor.b})`,
            border: `1px solid ${theme.border.default}`,
          }} />
        </div>
      )}

      <Separator />

      <ToolButton
        icon={<GridIcon size={16} />}
        label={gridEnabled ? 'Grid: ON' : 'Grid: OFF'}
        toggled={gridEnabled}
        onClick={onToggleGrid}
        disabled={!mapLoaded}
      />
      <ToolButton
        icon={<InspectIcon size={16} />}
        label={hoverInspect ? 'Hover Inspect: ON' : 'Hover Inspect: OFF'}
        shortcut="H"
        toggled={hoverInspect}
        onClick={onToggleHoverInspect}
        disabled={!mapLoaded}
      />
      <ToolButton
        icon={<HeightmapIcon size={16} />}
        label={!heightmapAvailable ? 'No Heightmap' : heightmapVisible ? 'Heightmap: ON' : 'Heightmap: OFF'}
        toggled={heightmapVisible}
        onClick={onToggleHeightmap}
        disabled={!mapLoaded || !heightmapAvailable}
      />

      {/* Heightmap opacity — floating popout on hover (only when heightmap is visible) */}
      {heightmapVisible && heightmapAvailable && (
        <HeightmapOpacityFlyout
          opacity={heightmapOpacity}
          onOpacityChange={onHeightmapOpacityChange}
        />
      )}

      {/* Brush size — floating popout on hover */}
      {showBrushFlyout && (
        <BrushSizeFlyout
          brushRadius={brushRadius}
          onBrushRadiusChange={onBrushRadiusChange}
        />
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      <Separator />

      {/* Undo / Redo */}
      <ToolButton
        icon={<UndoIcon size={16} />}
        label="Undo"
        shortcut="Ctrl+Z"
        onClick={onUndo}
        disabled={!canUndo}
      />
      <ToolButton
        icon={<RedoIcon size={16} />}
        label="Redo"
        shortcut="Ctrl+Y"
        onClick={onRedo}
        disabled={!canRedo}
      />
    </div>
  );
}
