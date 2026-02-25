/**
 * Theme — Centralized design system for the entire UI.
 */

import type React from 'react';

export const theme = {
  bg: {
    canvas:   '#010409',
    base:     '#0d1117',
    panel:    '#161b22',
    surface:  '#21262d',
    elevated: '#30363d',
    hover:    'rgba(56,139,253,0.15)',
    active:   'rgba(56,139,253,0.25)',
  },
  text: {
    primary:   '#e6edf3',
    secondary: '#8b949e',
    muted:     '#484f58',
    link:      '#58a6ff',
  },
  accent: {
    blue:       '#58a6ff',
    blueMuted:  'rgba(56,139,253,0.25)',
    blueStrong: '#1f6feb',
    green:      '#3fb950',
    yellow:     '#d29922',
    red:        '#f85149',
    purple:     '#bc8cff',
  },
  border: {
    default: '#30363d',
    muted:   '#21262d',
    active:  '#58a6ff',
  },
  toolbar: {
    bg:        '#161b22',
    activeBg:  'rgba(56,139,253,0.15)',
    activeBar: '#58a6ff',
    hoverBg:   '#21262d',
  },
  font: {
    family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    mono:   "'Cascadia Code', 'Fira Code', Consolas, monospace",
    sizeXs: 10,
    sizeSm: 11,
    sizeMd: 12,
    sizeLg: 13,
    sizeXl: 14,
  },
  space: {
    xs: 2,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 24,
  },
  radius: {
    sm: 3,
    md: 6,
    lg: 8,
  },
  transition: {
    fast:   'all 0.15s ease',
    medium: 'all 0.25s ease',
  },
  shadow: {
    dropdown: '0 8px 24px rgba(0,0,0,0.4)',
    tooltip:  '0 2px 8px rgba(0,0,0,0.5)',
  },
} as const;

/* ── Shared style builders ────────────────────────────── */

export function inputStyle(focused?: boolean): React.CSSProperties {
  return {
    background: theme.bg.base,
    color: theme.text.primary,
    border: `1px solid ${focused ? theme.border.active : theme.border.default}`,
    borderRadius: theme.radius.sm,
    padding: '6px 8px',
    fontSize: theme.font.sizeMd,
    fontFamily: theme.font.family,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    transition: theme.transition.fast,
  };
}

export function selectStyle(): React.CSSProperties {
  return {
    ...inputStyle(),
    cursor: 'pointer',
  };
}

export function labelStyle(): React.CSSProperties {
  return {
    color: theme.text.secondary,
    fontSize: theme.font.sizeSm,
    fontWeight: 500,
    marginBottom: theme.space.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };
}

export function sectionHeading(): React.CSSProperties {
  return {
    color: theme.text.primary,
    fontSize: theme.font.sizeXl,
    fontWeight: 600,
    margin: `0 0 ${theme.space.md}px`,
    letterSpacing: '-0.2px',
  };
}

export function dividerStyle(): React.CSSProperties {
  return {
    borderTop: `1px solid ${theme.border.muted}`,
    margin: `${theme.space.lg}px 0`,
  };
}

export function cardStyle(): React.CSSProperties {
  return {
    background: theme.bg.surface,
    border: `1px solid ${theme.border.muted}`,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
  };
}
