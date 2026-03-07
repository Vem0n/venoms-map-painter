/**
 * Toolbar — Slim top bar with file operations and app branding.
 *
 * All paint tools, toggles, and undo/redo have moved to VerticalToolBar.
 */

import React, { useState } from 'react';
import { theme } from '../theme';
import { FolderOpenIcon, SaveIcon } from './icons';

interface ToolbarProps {
  onOpenMap: () => void;
  onSaveAll: () => void;
  onSaveDraft: () => void;
  onLoadDraft: () => void;
  mapLoaded: boolean;
  loading: boolean;
}

function TopBarButton({ onClick, disabled, children, title }: {
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
        gap: 6,
        background: hover && !disabled ? theme.bg.hover : 'transparent',
        color: disabled ? theme.text.muted : theme.text.secondary,
        border: 'none',
        borderRadius: theme.radius.sm,
        padding: '4px 12px',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: theme.font.sizeMd,
        fontFamily: theme.font.family,
        transition: theme.transition.fast,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export default function Toolbar({ onOpenMap, onSaveAll, onSaveDraft, onLoadDraft, mapLoaded, loading }: ToolbarProps) {
  return (
    <div style={{
      height: 36,
      background: theme.bg.panel,
      borderBottom: `1px solid ${theme.border.default}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      flexShrink: 0,
    }}>
      <span style={{
        color: theme.text.muted,
        fontSize: theme.font.sizeMd,
        fontWeight: 500,
        letterSpacing: '-0.2px',
        userSelect: 'none',
      }}>
        Ven0m's Map Painter
      </span>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <TopBarButton onClick={onOpenMap} disabled={loading} title="Open a mod folder in this tab">
          <FolderOpenIcon size={14} />
          {loading ? 'Loading...' : 'Open Map'}
        </TopBarButton>

        <TopBarButton onClick={onLoadDraft} disabled={loading} title="Load a saved draft into this tab">
          <FolderOpenIcon size={14} />
          Load Draft
        </TopBarButton>

        <div style={{ width: 1, height: 16, background: theme.border.muted, margin: '0 4px' }} />

        <TopBarButton onClick={onSaveAll} disabled={!mapLoaded} title="Save map image + mod files for this tab (Ctrl+S)">
          <SaveIcon size={14} />
          Save
        </TopBarButton>

        <TopBarButton onClick={onSaveDraft} disabled={!mapLoaded} title="Save draft for this tab (Ctrl+Shift+S)">
          <SaveIcon size={14} />
          Save Draft
        </TopBarButton>
      </div>
    </div>
  );
}
