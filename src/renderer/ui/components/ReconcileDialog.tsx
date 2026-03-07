/**
 * ReconcileDialog — Modal confirmation for province reconciliation.
 *
 * Shows orphaned provinces and empty parent titles, letting the user
 * select which to remove before saving.
 */

import { useState, useCallback } from 'react';
import { theme, cardStyle } from '../theme';
import type { ProvinceData } from '@shared/types';
import type { OrphanedParent } from '../../reconciliation/reconcile';

interface ReconcileDialogProps {
  orphanedProvinces: ProvinceData[];
  orphanedParents: OrphanedParent[];
  onConfirm: (removedIds: number[], removedTitleKeys: string[]) => void;
  onCancel: () => void;
}

export default function ReconcileDialog({
  orphanedProvinces,
  orphanedParents,
  onConfirm,
  onCancel,
}: ReconcileDialogProps) {
  const [checkedIds, setCheckedIds] = useState<Set<number>>(
    () => new Set(orphanedProvinces.map(p => p.id))
  );
  const [checkedTitles, setCheckedTitles] = useState<Set<string>>(
    () => new Set(orphanedParents.map(p => p.key))
  );

  const toggleId = useCallback((id: number) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleTitle = useCallback((key: string) => {
    setCheckedTitles(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllProvinces = useCallback(() => {
    setCheckedIds(new Set(orphanedProvinces.map(p => p.id)));
  }, [orphanedProvinces]);

  const deselectAllProvinces = useCallback(() => {
    setCheckedIds(new Set());
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(checkedIds), Array.from(checkedTitles));
  }, [checkedIds, checkedTitles, onConfirm]);

  const removeCount = checkedIds.size;

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <h2 style={titleStyle}>Province Reconciliation</h2>
        <p style={descStyle}>
          The following provinces no longer have any pixels on the map.
          Select which to remove from mod files. IDs will be renumbered sequentially.
        </p>

        {/* Orphaned Provinces */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <span style={sectionLabelStyle}>
              Orphaned Provinces ({orphanedProvinces.length})
            </span>
            <div style={{ display: 'flex', gap: theme.space.sm }}>
              <button style={linkBtnStyle} onClick={selectAllProvinces}>Select All</button>
              <button style={linkBtnStyle} onClick={deselectAllProvinces}>Deselect All</button>
            </div>
          </div>
          <div style={listStyle}>
            {orphanedProvinces.map(p => (
              <label key={p.id} style={rowStyle}>
                <input
                  type="checkbox"
                  checked={checkedIds.has(p.id)}
                  onChange={() => toggleId(p.id)}
                  style={{ marginRight: theme.space.md }}
                />
                <span
                  style={{
                    ...swatchStyle,
                    backgroundColor: `rgb(${p.color.r},${p.color.g},${p.color.b})`,
                  }}
                />
                <span style={idStyle}>#{p.id}</span>
                <span style={nameStyle}>{p.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Orphaned Parent Titles */}
        {orphanedParents.length > 0 && (
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span style={sectionLabelStyle}>
                Empty Parent Titles ({orphanedParents.length})
              </span>
            </div>
            <p style={{ ...descStyle, marginBottom: theme.space.sm }}>
              These titles would have no remaining baronies after removal.
            </p>
            <div style={listStyle}>
              {orphanedParents.map(p => (
                <label key={p.key} style={rowStyle}>
                  <input
                    type="checkbox"
                    checked={checkedTitles.has(p.key)}
                    onChange={() => toggleTitle(p.key)}
                    style={{ marginRight: theme.space.md }}
                  />
                  <span style={tierBadgeStyle(p.tier)}>{p.tier.toUpperCase()}</span>
                  <span style={nameStyle}>{p.key}</span>
                  <span style={mutedStyle}>({p.totalBaronies} baronies)</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Experimental Warning */}
        <div style={warningStyle}>
          <strong>EXPERIMENTAL FEATURE</strong>
          <p style={{ margin: `${theme.space.xs}px 0 0` }}>
            VMP was designed with province creation in mind. Province deletion
            involves reconciling IDs across many interdependent files &mdash; even
            if the game loads, there may be subtle issues VMP cannot detect.
            Use at your own risk. A backup is created automatically before any
            changes are made.
          </p>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <p style={footnoteStyle}>Saving applies to the active tab only.</p>
          <div style={{ display: 'flex', gap: theme.space.md }}>
            <button style={cancelBtnStyle} onClick={onCancel}>Cancel</button>
            <button
              style={removeCount > 0 ? confirmBtnStyle : saveBtnStyle}
              onClick={handleConfirm}
            >
              {removeCount > 0
                ? `Remove & Renumber (${removeCount})`
                : 'Save Without Changes'}
            </button>
          </div>
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
  maxWidth: 600,
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

const sectionStyle: React.CSSProperties = {
  marginBottom: theme.space.xl,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: theme.space.sm,
};

const sectionLabelStyle: React.CSSProperties = {
  color: theme.text.primary,
  fontSize: theme.font.sizeLg,
  fontWeight: 600,
  fontFamily: theme.font.family,
};

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: theme.text.link,
  fontSize: theme.font.sizeSm,
  fontFamily: theme.font.family,
  cursor: 'pointer',
  padding: 0,
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

const mutedStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: theme.font.sizeSm,
  marginLeft: theme.space.sm,
};

function tierBadgeStyle(tier: string): React.CSSProperties {
  const colors: Record<string, string> = {
    e: theme.accent.purple,
    k: theme.accent.yellow,
    d: theme.accent.blue,
    c: theme.accent.green,
  };
  return {
    display: 'inline-block',
    padding: `1px ${theme.space.sm}px`,
    borderRadius: theme.radius.sm,
    backgroundColor: `${colors[tier] ?? theme.text.muted}33`,
    color: colors[tier] ?? theme.text.muted,
    fontSize: theme.font.sizeXs,
    fontWeight: 600,
    fontFamily: theme.font.mono,
    marginRight: theme.space.md,
    minWidth: 20,
    textAlign: 'center',
  };
}

const warningStyle: React.CSSProperties = {
  backgroundColor: `${theme.accent.yellow}1a`,
  border: `1px solid ${theme.accent.yellow}55`,
  borderRadius: theme.radius.sm,
  padding: theme.space.lg,
  marginBottom: theme.space.xl,
  color: theme.accent.yellow,
  fontSize: theme.font.sizeSm,
  fontFamily: theme.font.family,
  lineHeight: 1.5,
};

const footnoteStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: theme.font.sizeXs,
  fontFamily: theme.font.family,
  fontStyle: 'italic',
  margin: 0,
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
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

const confirmBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.accent.red,
  color: '#fff',
};

const saveBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.accent.green,
  color: '#fff',
};
