/**
 * PendingOrphanDialog — Modal shown when erase removes all pixels of a pending province.
 *
 * Lets the user confirm which orphaned pending provinces to remove from the pending map.
 * Follows the same modal pattern as ReconcileDialog.
 */

import { useState, useCallback } from 'react';
import { theme, cardStyle } from '../theme';
import { rgbToKey } from '@shared/types';
import type { PendingProvince } from '@shared/types';

interface PendingOrphanDialogProps {
  orphanedEntries: PendingProvince[];
  onConfirm: (removedColorKeys: string[]) => void;
  onCancel: () => void;
}

export default function PendingOrphanDialog({
  orphanedEntries,
  onConfirm,
  onCancel,
}: PendingOrphanDialogProps) {
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(
    () => new Set(orphanedEntries.map(e => rgbToKey(e.color)))
  );

  const toggleKey = useCallback((key: string) => {
    setCheckedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(checkedKeys));
  }, [checkedKeys, onConfirm]);

  const removeCount = checkedKeys.size;

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <h2 style={titleStyle}>Pending Provinces Orphaned</h2>
        <p style={descStyle}>
          The following pending provinces no longer have any pixels on the map.
          Select which to remove from the pending list.
        </p>

        <div style={listStyle}>
          {orphanedEntries.map(entry => {
            const key = rgbToKey(entry.color);
            return (
              <label key={key} style={rowStyle}>
                <input
                  type="checkbox"
                  checked={checkedKeys.has(key)}
                  onChange={() => toggleKey(key)}
                  style={{ marginRight: theme.space.md }}
                />
                <span
                  style={{
                    ...swatchStyle,
                    backgroundColor: `rgb(${entry.color.r},${entry.color.g},${entry.color.b})`,
                  }}
                />
                <span style={idStyle}>#{entry.id}</span>
                <span style={nameStyle}>{entry.name}</span>
              </label>
            );
          })}
        </div>

        <div style={footerStyle}>
          <button style={keepBtnStyle} onClick={onCancel}>Keep All</button>
          <button
            style={removeCount > 0 ? removeBtnStyle : removeBtnDisabledStyle}
            onClick={handleConfirm}
            disabled={removeCount === 0}
          >
            Remove Selected ({removeCount})
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
  maxWidth: 500,
  maxHeight: '70vh',
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
  maxHeight: 240,
  overflowY: 'auto',
  backgroundColor: theme.bg.base,
  border: `1px solid ${theme.border.muted}`,
  borderRadius: theme.radius.sm,
  padding: theme.space.sm,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: `${theme.space.xs}px ${theme.space.sm}px`,
  cursor: 'pointer',
  fontFamily: theme.font.family,
  fontSize: theme.font.sizeMd,
};

const swatchStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 14,
  height: 14,
  borderRadius: 2,
  border: `1px solid ${theme.border.default}`,
  marginRight: theme.space.md,
  flexShrink: 0,
};

const idStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontFamily: theme.font.mono,
  fontSize: theme.font.sizeSm,
  marginRight: theme.space.md,
  minWidth: 40,
};

const nameStyle: React.CSSProperties = {
  color: theme.text.primary,
  flex: 1,
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

const keepBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.bg.elevated,
  color: theme.text.primary,
};

const removeBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.accent.red,
  color: '#fff',
};

const removeBtnDisabledStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.bg.elevated,
  color: theme.text.muted,
  cursor: 'not-allowed',
};
