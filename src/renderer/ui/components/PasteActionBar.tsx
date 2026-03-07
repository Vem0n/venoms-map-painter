/**
 * PasteActionBar — Floating toolbar shown during paste mode.
 * Provides scale/rotation controls, Cancel and Accept buttons.
 */

import React, { useState } from 'react';
import { theme } from '../theme';
import { XIcon, CheckIcon } from './icons';

type AdjustMode = 'scale' | 'rotation';

interface PasteActionBarProps {
  onCancel: () => void;
  onAccept: () => void;
  pasting: boolean;
  scale: number;
  rotation: number;
  onScale: (delta: number) => void;
  onRotate: (deltaDeg: number) => void;
  onReset: () => void;
  adjustMode: AdjustMode;
  onAdjustModeChange: (mode: AdjustMode) => void;
}

function PasteButton({ onClick, disabled, children, title, accent }: {
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
        padding: '6px 14px',
        border: 'none',
        borderRadius: theme.radius.sm,
        fontSize: theme.font.sizeMd,
        fontFamily: theme.font.family,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: theme.transition.fast,
        background: accent
          ? (hover && !disabled ? '#2ea043' : theme.accent.green)
          : (hover && !disabled ? theme.bg.elevated : 'transparent'),
        color: accent ? '#fff' : theme.text.secondary,
      }}
    >
      {children}
    </button>
  );
}

function SmallButton({ onClick, disabled, children, title }: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
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
        justifyContent: 'center',
        width: 22,
        height: 22,
        padding: 0,
        border: 'none',
        borderRadius: theme.radius.sm,
        fontSize: 13,
        fontFamily: theme.font.family,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: theme.transition.fast,
        background: hover && !disabled ? theme.bg.elevated : 'transparent',
        color: theme.text.secondary,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

export default function PasteActionBar({
  onCancel, onAccept, pasting,
  scale, rotation, onScale, onRotate, onReset,
  adjustMode, onAdjustModeChange,
}: PasteActionBarProps) {
  const isTransformed = scale !== 1 || rotation !== 0;
  const scaleActive = adjustMode === 'scale';
  const rotActive = adjustMode === 'rotation';

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
        {/* Scale controls */}
        <SmallButton onClick={() => onScale(-0.1)} disabled={pasting} title="Scale down 10% (-)">
          −
        </SmallButton>
        <span
          onClick={() => onAdjustModeChange('scale')}
          style={{
            ...labelStyle,
            cursor: 'pointer',
            color: scaleActive ? theme.accent.blue : theme.text.muted,
            borderBottom: scaleActive ? `2px solid ${theme.accent.blue}` : '2px solid transparent',
            paddingBottom: 1,
          }}
          title="Scale — click to adjust with Ctrl+Scroll"
        >
          {Math.round(scale * 100)}%
        </span>
        <SmallButton onClick={() => onScale(0.1)} disabled={pasting} title="Scale up 10% (+)">
          +
        </SmallButton>

        <Divider />

        {/* Rotation controls */}
        <SmallButton onClick={() => onRotate(-15)} disabled={pasting} title="Rotate -15° ([)">
          ↶
        </SmallButton>
        <span
          onClick={() => onAdjustModeChange('rotation')}
          style={{
            ...labelStyle,
            cursor: 'pointer',
            color: rotActive ? theme.accent.blue : theme.text.muted,
            borderBottom: rotActive ? `2px solid ${theme.accent.blue}` : '2px solid transparent',
            paddingBottom: 1,
          }}
          title="Rotation — click to adjust with Ctrl+Scroll"
        >
          {Math.round(rotation)}°
        </span>
        <SmallButton onClick={() => onRotate(15)} disabled={pasting} title="Rotate +15° (])">
          ↷
        </SmallButton>

        {isTransformed && (
          <>
            <Divider />
            <SmallButton onClick={onReset} disabled={pasting} title="Reset transforms">
              ↺
            </SmallButton>
          </>
        )}

        <Divider />

        <span style={{
          ...labelStyle,
          padding: '0 2px',
        }}>
          {pasting ? 'Pasting...' : 'Ctrl+Scroll to adjust'}
        </span>

        <Divider />

        <PasteButton onClick={onCancel} disabled={pasting} title="Cancel paste (Escape)">
          <XIcon size={12} />
          Cancel
        </PasteButton>

        <PasteButton onClick={onAccept} disabled={pasting} title="Accept paste" accent>
          <CheckIcon size={14} color="#fff" />
          {pasting ? 'Pasting...' : 'Accept'}
        </PasteButton>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: theme.border.default, margin: '0 2px' }} />;
}

const labelStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: theme.font.sizeXs,
  fontFamily: theme.font.mono,
  minWidth: 32,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};
