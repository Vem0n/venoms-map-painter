/**
 * StatusBar — Bottom bar showing cursor coordinates, zoom level, active tool, and status.
 */

import type { ToolType, RGB } from '@shared/types';
import { theme } from '../theme';

interface StatusBarProps {
  cursorPos: { gx: number; gy: number } | null;
  zoomLevel: number;
  status: string;
  activeTool?: ToolType;
  activeColor?: RGB;
  provinceCount?: number;
}

const toolLabels: Record<ToolType, string> = {
  'flood-fill': 'Flood Fill',
  'brush': 'Brush',
  'eraser': 'Eraser',
  'border-paint': 'Border Paint',
};

export default function StatusBar({ cursorPos, zoomLevel, status, activeTool, activeColor, provinceCount }: StatusBarProps) {
  const coordText = cursorPos
    ? `X: ${cursorPos.gx}  Y: ${cursorPos.gy}`
    : 'X: -  Y: -';

  const zoomText = `${Math.round(zoomLevel * 100)}%`;

  return (
    <div style={{
      height: 24,
      background: theme.bg.panel,
      borderTop: `1px solid ${theme.border.default}`,
      fontSize: theme.font.sizeSm,
      padding: '0 12px',
      display: 'flex',
      alignItems: 'center',
      color: theme.text.muted,
      gap: 24,
      flexShrink: 0,
    }}>
      <span style={{ fontFamily: theme.font.mono, minWidth: 160, color: theme.text.secondary }}>
        {coordText}
      </span>
      <span style={{ fontFamily: theme.font.mono, minWidth: 60 }}>Zoom: {zoomText}</span>
      {activeTool && (
        <span style={{ color: theme.text.secondary }}>Tool: {toolLabels[activeTool]}</span>
      )}
      {activeColor && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            border: `1px solid ${theme.border.default}`,
            background: `rgb(${activeColor.r},${activeColor.g},${activeColor.b})`,
          }} />
          <span style={{ fontFamily: theme.font.mono, color: theme.text.secondary }}>
            {activeColor.r},{activeColor.g},{activeColor.b}
          </span>
        </span>
      )}
      {provinceCount !== undefined && (
        <span>Provinces: {provinceCount}</span>
      )}
      <span style={{ marginLeft: 'auto', color: theme.text.secondary }}>{status}</span>
    </div>
  );
}
