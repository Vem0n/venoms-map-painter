/**
 * UnsavedTabsDialog — Shared guard for closing a dirty tab or the window.
 *
 * Window closure lists dirty tabs with checkboxes; tab closure offers one
 * draft save. Both keep the editor open and show an error when saving fails.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { SaveFailureReport } from '@shared/types';
import { SaveFailureNotice } from './SaveFailureDialog';
import { theme, cardStyle } from '../theme';

export interface DirtyTabEntry {
  tabId: number;
  label: string;
}

interface UnsavedTabsDialogProps {
  dirtyTabs: DirtyTabEntry[];
  closingTab?: boolean;
  error?: SaveFailureReport | null;
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
  dirtyTabs, closingTab = false, error, onSave, onDiscard, onCancel, saving,
}: UnsavedTabsDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
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
      <div role="dialog" aria-modal="true" aria-labelledby="close-guard-title" style={dialogStyle} onKeyDown={event => {
        event.stopPropagation();
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') event.preventDefault();
        if (event.key === 'Escape') { event.preventDefault(); if (!saving) onCancel(); }
      }}>
        <h2 id="close-guard-title" style={titleStyle}>{error ? 'Saving has failed' : closingTab ? 'Close Tab' : 'Unsaved Changes'}</h2>
        <p style={descStyle}>
          {closingTab
            ? 'This tab has unsaved changes. Save a draft before closing it?'
            : 'The following tabs have unsaved changes. Select which to save as drafts before closing the window. Unselected tabs will be discarded.'}
          {' '}Draft saves keep your work in VMP-Drafts and do not modify mod files.
        </p>

        <div style={listStyle}>
          {dirtyTabs.map(tab => (
            <label key={tab.tabId} style={rowStyle}>
              {!closingTab && <input
                type="checkbox"
                checked={checked.has(tab.tabId)}
                onChange={() => toggle(tab.tabId)}
                disabled={saving}
                style={{ accentColor: theme.accent.blue, marginRight: 8 }}
              />}
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

        {error && <SaveFailureNotice failure={error} draftSave={true} />}

        <div style={footerStyle}>
          <button ref={cancelRef} style={cancelBtnStyle} onClick={onCancel} disabled={saving}>{error ? 'Back to Editing' : 'Cancel'}</button>
          <button style={discardBtnStyle} onClick={onDiscard} disabled={saving}>{error ? closingTab ? 'Close Tab Without Saving' : 'Close Without Saving' : "Don't Save"}</button>
          <button
            style={saveBtnStyle}
            onClick={() => onSave(checked)}
            disabled={saving}
          >
            {saving ? 'Saving...' : closingTab ? 'Save Draft & Close' : checked.size > 0 ? `Save ${checked.size} Draft${checked.size === 1 ? '' : 's'} & Close` : 'Discard & Close'}
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
  zIndex: 20000,
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
