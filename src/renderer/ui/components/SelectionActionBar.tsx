/**
 * SelectionActionBar — Floating action bar shown on the canvas when the lasso
 * tool is active. Provides select mode toggle, Harmonize Colors, Copy, and Clear.
 */

import React, { useState } from 'react';
import { theme } from '../theme';
import { PaletteIcon, XIcon, CopyIcon } from './icons';
import type { SelectMode } from '@tools/copy-paste-manager';

interface SelectionActionBarProps {
  selectedCount: number;
  selectMode: SelectMode;
  onSelectModeChange: (mode: SelectMode) => void;
  onHarmonize: () => void;
  onCopy: () => void;
  onClear: () => void;
  harmonizing: boolean;
  copying: boolean;
  lassoActive: boolean;
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

function ModeToggle({ mode, onChange }: { mode: SelectMode; onChange: (m: SelectMode) => void }) {
  return (
    <div style={{
      display: 'flex',
      borderRadius: theme.radius.sm,
      overflow: 'hidden',
      border: `1px solid ${theme.border.muted}`,
    }}>
      <ModeButton label="Province" active={mode === 'province'} onClick={() => onChange('province')} />
      <ModeButton label="Normal" active={mode === 'normal'} onClick={() => onChange('normal')} />
    </div>
  );
}

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '4px 10px',
        border: 'none',
        fontSize: theme.font.sizeXs,
        fontFamily: theme.font.family,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: theme.transition.fast,
        background: active ? theme.accent.blue : (hover ? theme.bg.elevated : 'transparent'),
        color: active ? '#fff' : theme.text.muted,
      }}
    >
      {label}
    </button>
  );
}

export default function SelectionActionBar({
  selectedCount, selectMode, onSelectModeChange,
  onHarmonize, onCopy, onClear,
  harmonizing, copying, lassoActive,
}: SelectionActionBarProps) {
  // Show when lasso is active (for mode toggle) OR when there's a selection
  if (!lassoActive && selectedCount === 0) return null;

  const busy = harmonizing || copying;

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
        <ModeToggle mode={selectMode} onChange={onSelectModeChange} />

        {selectedCount > 0 && (
          <>
            <div style={{ width: 1, height: 20, background: theme.border.default, margin: '0 2px' }} />

            <span style={{
              color: theme.text.muted,
              fontSize: theme.font.sizeSm,
              fontFamily: theme.font.family,
              padding: '0 4px',
              whiteSpace: 'nowrap',
            }}>
              {selectMode === 'province'
                ? `${selectedCount} province${selectedCount !== 1 ? 's' : ''}`
                : `${selectedCount} color${selectedCount !== 1 ? 's' : ''}`
              }
            </span>

            <div style={{ width: 1, height: 20, background: theme.border.default, margin: '0 2px' }} />

            {selectMode === 'province' && (
              <ActionButton
                onClick={onHarmonize}
                disabled={busy}
                title="Generate a cohesive color palette for selected provinces"
                accent
              >
                <PaletteIcon size={14} color="#fff" />
                {harmonizing ? 'Harmonizing...' : 'Harmonize'}
              </ActionButton>
            )}

            <ActionButton
              onClick={onCopy}
              disabled={busy}
              title="Copy selection to clipboard (Ctrl+C)"
            >
              <CopyIcon size={12} />
              {copying ? 'Copying...' : 'Copy'}
            </ActionButton>

            <ActionButton
              onClick={onClear}
              disabled={busy}
              title="Clear selection"
            >
              <XIcon size={12} />
              Clear
            </ActionButton>
          </>
        )}
      </div>
    </div>
  );
}
