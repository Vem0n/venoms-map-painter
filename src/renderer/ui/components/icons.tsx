/**
 * Icons — Inline SVG icon components for the UI.
 *
 * Stroke-based, 24×24 viewBox. Each accepts optional size and color.
 * No external icon library needed.
 */

import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

const defaults = { size: 18, color: 'currentColor' };

export function FloodFillIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M16.56 3.44a1.5 1.5 0 010 2.12L7.12 15H5v-2.12l9.44-9.44a1.5 1.5 0 012.12 0z" />
      <path d="M2 20h7" />
      <path d="M19 13s3 2.5 3 5a3 3 0 01-6 0c0-2.5 3-5 3-5z" fill={color} stroke="none" />
    </svg>
  );
}

export function BrushIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M18.37 2.63a2.12 2.12 0 013 3L14 13l-4 1 1-4z" />
      <path d="M9 14.5A3.5 3.5 0 005.5 18H4a3 3 0 01-1 5.83A5 5 0 019 19v-4.5z" />
    </svg>
  );
}

export function EraserIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M7 21h10" />
      <path d="M5.5 13.5L13.5 5.5a2.12 2.12 0 013 0l2 2a2.12 2.12 0 010 3L10.5 18.5a2 2 0 01-1.41.58H6.17a2 2 0 01-1.41-.58l-.76-.76a2 2 0 010-2.83z" />
      <path d="M5.5 13.5l5.5 5.5" />
    </svg>
  );
}

export function EyedropperIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M2 22l1-1h3l9-9" />
      <path d="M3 21l9-9" />
      <path d="M15 6l3 3" />
      <circle cx="18.5" cy="3.5" r="2.5" />
    </svg>
  );
}

export function GridIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

export function LockIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export function LockOpenIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 019.9-1" />
    </svg>
  );
}

export function CircleIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function UndoIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 0118 0 9 9 0 01-9 9 9 9 0 01-7.7-4.4" />
    </svg>
  );
}

export function RedoIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M21 7v6h-6" />
      <path d="M21 13a9 9 0 00-18 0 9 9 0 009 9 9 9 0 007.7-4.4" />
    </svg>
  );
}

export function FolderOpenIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M6 14l1.45-2.9A2 2 0 019.24 10H20a2 2 0 011.94 2.5l-1.55 6A2 2 0 0118.44 20H4a2 2 0 01-2-2V5a2 2 0 012-2h3.93a2 2 0 011.66.9l.82 1.2A2 2 0 0012.07 6H18a2 2 0 012 2v2" />
    </svg>
  );
}

export function SaveIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M15.2 3a2 2 0 011.4.6l3.8 3.8a2 2 0 01.6 1.4V19a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M17 21v-7H7v7" />
      <path d="M7 3v4h7" />
    </svg>
  );
}

export function SearchIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function XIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function ChevronDownIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function InspectIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="1" fill={color} stroke="none" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
    </svg>
  );
}

export function BordersIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M3 3h18v18H3z" />
      <path d="M12 3v18" />
      <path d="M3 12h18" />
    </svg>
  );
}
