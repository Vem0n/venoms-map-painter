/**
 * SelectionActionBar — Floating action bar shown on the canvas when provinces
 * are selected via lasso. Provides Harmonize Colors and Clear actions.
 */

import React, { useState } from 'react';
import { theme } from '../theme';
import { PaletteIcon, XIcon } from './icons';

interface SelectionActionBarProps {
  selectedCount: number;
  onHarmonize: () => void;
  onClear: () => void;
  harmonizing: boolean;
}

function ActionButton({ onClick, disabled, children, title, accent }: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
  accent?: boolean;
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        border: 'none',
        borderRadius: theme.radius.sm,
        fontSize: theme.font.sizeMd,
        fontFamily: theme.font.family,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: theme.transition.fast,
        background: accent
          ? (hover && !disabled ? theme.accent.blueStrong : theme.accent.blue)
          : (hover && !disabled ? theme.bg.elevated : 'transparent'),
        color: accent ? '#fff' : theme.text.secondary,
      }}
    >
      {children}
    </button>
  );
}

export default function SelectionActionBar({
  selectedCount, onHarmonize, onClear, harmonizing,
}: SelectionActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 900,
      pointerEvents: 'auto',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(13, 17, 23, 0.9)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${theme.border.default}`,
        borderRadius: theme.radius.md,
        padding: '6px 8px',
        boxShadow: theme.shadow.dropdown,
      }}>
        <span style={{
          color: theme.text.muted,
          fontSize: theme.font.sizeSm,
          fontFamily: theme.font.family,
          padding: '0 8px 0 4px',
          whiteSpace: 'nowrap',
        }}>
          {selectedCount} province{selectedCount !== 1 ? 's' : ''}
        </span>

        <div style={{ width: 1, height: 20, background: theme.border.default }} />

        <ActionButton
          onClick={onHarmonize}
          disabled={harmonizing}
          title="Generate a cohesive color palette for selected provinces"
          accent
        >
          <PaletteIcon size={14} color="#fff" />
          {harmonizing ? 'Harmonizing...' : 'Harmonize Colors'}
        </ActionButton>

        <ActionButton
          onClick={onClear}
          disabled={harmonizing}
          title="Clear selection"
        >
          <XIcon size={12} />
          Clear
        </ActionButton>
      </div>
    </div>
  );
}
