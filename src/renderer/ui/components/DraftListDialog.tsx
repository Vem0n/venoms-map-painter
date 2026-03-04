/**
 * DraftListDialog — Modal for browsing and selecting a draft to load.
 *
 * Shows a scrollable list of available drafts with name, date, and delete button.
 * Follows the same overlay/card pattern as ReconcileDialog.
 */

import { useState, useCallback } from 'react';
import { theme, cardStyle } from '../theme';
import type { DraftSummary } from '@shared/types';

interface DraftListDialogProps {
  drafts: DraftSummary[];
  onSelect: (folderName: string) => void;
  onDelete: (folderName: string) => void;
  onCancel: () => void;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${date} at ${time}`;
  } catch {
    return iso;
  }
}

export default function DraftListDialog({
  drafts,
  onSelect,
  onDelete,
  onCancel,
}: DraftListDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleLoad = useCallback(() => {
    if (selected) onSelect(selected);
  }, [selected, onSelect]);

  const handleRowClick = useCallback((folderName: string) => {
    setSelected(folderName);
    setConfirmDelete(null);
  }, []);

  const handleRowDoubleClick = useCallback((folderName: string) => {
    onSelect(folderName);
  }, [onSelect]);

  const handleDeleteClick = useCallback((e: React.MouseEvent, folderName: string) => {
    e.stopPropagation();
    if (confirmDelete === folderName) {
      // Second click — confirm deletion
      onDelete(folderName);
      setConfirmDelete(null);
      if (selected === folderName) setSelected(null);
    } else {
      // First click — mark for confirmation
      setConfirmDelete(folderName);
    }
  }, [confirmDelete, selected, onDelete]);

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <h2 style={titleStyle}>Load Draft</h2>
        <p style={descStyle}>
          Select a draft to restore. Double-click to load immediately.
        </p>

        {drafts.length === 0 ? (
          <p style={{ ...descStyle, color: theme.text.muted }}>No drafts found.</p>
        ) : (
          <div style={listStyle}>
            {drafts.map(draft => {
              const isSelected = selected === draft.folderName;
              const isConfirmingDelete = confirmDelete === draft.folderName;
              return (
                <div
                  key={draft.folderName}
                  onClick={() => handleRowClick(draft.folderName)}
                  onDoubleClick={() => handleRowDoubleClick(draft.folderName)}
                  style={{
                    ...rowStyle,
                    backgroundColor: isSelected ? theme.bg.active : 'transparent',
                    borderLeft: isSelected
                      ? `2px solid ${theme.accent.blue}`
                      : '2px solid transparent',
                  }}
                >
                  <div style={rowContentStyle}>
                    <div style={nameStyle}>{draft.name}</div>
                    <div style={dateStyle}>{formatTimestamp(draft.timestamp)}</div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteClick(e, draft.folderName)}
                    style={isConfirmingDelete ? deleteBtnConfirmStyle : deleteBtnStyle}
                    title={isConfirmingDelete ? 'Click again to confirm deletion' : 'Delete draft'}
                  >
                    {isConfirmingDelete ? 'Confirm?' : 'Delete'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={footerStyle}>
          <button style={cancelBtnStyle} onClick={onCancel}>Cancel</button>
          <button
            style={selected ? loadBtnStyle : loadBtnDisabledStyle}
            onClick={handleLoad}
            disabled={!selected}
          >
            Load
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────── */

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
  maxWidth: 540,
  maxHeight: '80vh',
  overflowY: 'auto',
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
  maxHeight: 320,
  overflowY: 'auto',
  backgroundColor: theme.bg.base,
  border: `1px solid ${theme.border.muted}`,
  borderRadius: theme.radius.sm,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: `${theme.space.md}px ${theme.space.lg}px`,
  cursor: 'pointer',
  fontFamily: theme.font.family,
  transition: theme.transition.fast,
  borderBottom: `1px solid ${theme.border.muted}`,
};

const rowContentStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const nameStyle: React.CSSProperties = {
  color: theme.text.primary,
  fontSize: theme.font.sizeMd,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const dateStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: theme.font.sizeSm,
  marginTop: 2,
};

const deleteBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: theme.text.muted,
  border: 'none',
  fontSize: theme.font.sizeSm,
  fontFamily: theme.font.family,
  cursor: 'pointer',
  padding: `${theme.space.xs}px ${theme.space.sm}px`,
  borderRadius: theme.radius.sm,
  flexShrink: 0,
  marginLeft: theme.space.md,
};

const deleteBtnConfirmStyle: React.CSSProperties = {
  ...deleteBtnStyle,
  color: theme.accent.red,
  fontWeight: 600,
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

const loadBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.accent.blue,
  color: '#fff',
};

const loadBtnDisabledStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.bg.elevated,
  color: theme.text.muted,
  cursor: 'not-allowed',
};
