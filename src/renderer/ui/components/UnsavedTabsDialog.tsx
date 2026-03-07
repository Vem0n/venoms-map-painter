/**
 * UnsavedTabsDialog — Shown when closing the app with multiple dirty tabs.
 *
 * Lists each dirty tab with a checkbox. User picks which to save,
 * then "Save Selected" saves them sequentially before closing.
 */

import React, { useState } from 'react';
import { theme, cardStyle } from '../theme';

export interface DirtyTabEntry {
  tabId: number;
  label: string;
}

interface UnsavedTabsDialogProps {
  dirtyTabs: DirtyTabEntry[];
  /** Save selected tabs then close. Called with the set of tab IDs to save. */
  onSave: (tabIds: Set<number>) => void;
  /** Discard all changes and close */
  onDiscard: () => void;
  /** Cancel — go back to editing */
  onCancel: () => void;
  /** True while saves are in progress */
  saving?: boolean;
}

export default function UnsavedTabsDialog({
  dirtyTabs, onSave, onDiscard, onCancel, saving,
}: UnsavedTabsDialogProps) {
  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(dirtyTabs.map(t => t.tabId)),
  );

  const toggle = (tabId: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <h2 style={titleStyle}>Unsaved Changes</h2>
        <p style={descStyle}>
          The following tabs have unsaved changes. Select which to save before closing:
        </p>

        <div style={listStyle}>
          {dirtyTabs.map(tab => (
            <label key={tab.tabId} style={rowStyle}>
              <input
                type="checkbox"
                checked={checked.has(tab.tabId)}
                onChange={() => toggle(tab.tabId)}
                disabled={saving}
                style={{ accentColor: theme.accent.blue, marginRight: 8 }}
              />
              <span style={{
                color: theme.text.primary,
                fontSize: theme.font.sizeMd,
                fontFamily: theme.font.family,
              }}>
                {tab.label}
              </span>
            </label>
          ))}
        </div>

        <div style={footerStyle}>
          <button style={cancelBtnStyle} onClick={onCancel} disabled={saving}>Cancel</button>
          <button style={discardBtnStyle} onClick={onDiscard} disabled={saving}>Don't Save</button>
          <button
            style={saveBtnStyle}
            onClick={() => onSave(checked)}
            disabled={saving}
          >
            {saving ? 'Saving...' : checked.size > 0 ? `Save ${checked.size} & Close` : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -- Styles ------------------------------------------------ */

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  ...cardStyle(),
  backgroundColor: theme.bg.panel,
  border: `1px solid ${theme.border.default}`,
  borderRadius: theme.radius.lg,
  padding: theme.space.xxl,
  maxWidth: 480,
  width: '90%',
  boxShadow: theme.shadow.dropdown,
};

const titleStyle: React.CSSProperties = {
  color: theme.text.primary,
  fontSize: 16,
  fontWeight: 600,
  fontFamily: theme.font.family,
  margin: `0 0 ${theme.space.md}px`,
};

const descStyle: React.CSSProperties = {
  color: theme.text.secondary,
  fontSize: theme.font.sizeMd,
  fontFamily: theme.font.family,
  margin: `0 0 ${theme.space.lg}px`,
  lineHeight: 1.5,
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: `${theme.space.md}px 0`,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  padding: `${theme.space.sm}px ${theme.space.md}px`,
  borderRadius: theme.radius.sm,
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: theme.space.md,
  marginTop: theme.space.xl,
  borderTop: `1px solid ${theme.border.muted}`,
  paddingTop: theme.space.xl,
};

const baseBtnStyle: React.CSSProperties = {
  padding: `${theme.space.md}px ${theme.space.xl}px`,
  borderRadius: theme.radius.sm,
  fontSize: theme.font.sizeMd,
  fontFamily: theme.font.family,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
};

const cancelBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.bg.elevated,
  color: theme.text.primary,
};

const discardBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.bg.elevated,
  color: theme.accent.yellow,
};

const saveBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.accent.green,
  color: '#fff',
};
