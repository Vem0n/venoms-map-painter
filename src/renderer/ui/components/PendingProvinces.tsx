/**
 * PendingProvinces — 4th sidebar tab showing provinces created but not yet saved.
 *
 * Displays the pending province list with color swatches, IDs, and names.
 * Delete erases pixels from the map and reconciles IDs immediately.
 * Saving happens only via the global Ctrl+S save.
 */

import { theme, sectionHeading } from '../theme';
import { rgbToKey } from '@shared/types';
import type { PendingSaveOptions } from '@shared/types';
import type { PendingProvinceMap } from '@registry/pending-province-map';

interface PendingProvincesProps {
  pendingMap: PendingProvinceMap;
  onDelete: (colorKey: string) => void;
  onEdit: (colorKey: string) => void;
  modLoaded: boolean;
  saveOptions: PendingSaveOptions;
  onSaveOptionsChange: (options: PendingSaveOptions) => void;
}

export default function PendingProvinces({
  pendingMap,
  onDelete,
  onEdit,
  modLoaded,
  saveOptions,
  onSaveOptionsChange,
}: PendingProvincesProps) {
  const entries = pendingMap.getAll();

  if (!modLoaded) {
    return (
      <div>
        <h3 style={sectionHeading()}>To Be Created</h3>
        <p style={emptyStyle}>Load a mod first</p>
      </div>
    );
  }

  const toggleOption = (key: keyof PendingSaveOptions) => {
    if (key === 'definitionCsv') return; // mandatory
    onSaveOptionsChange({ ...saveOptions, [key]: !saveOptions[key] });
  };

  return (
    <div>
      <h3 style={sectionHeading()}>To Be Created</h3>

      {entries.length === 0 ? (
        <p style={emptyStyle}>No pending provinces</p>
      ) : (
        <>
          <div style={listContainerStyle}>
            {entries.map(entry => {
              const key = rgbToKey(entry.color);
              const isUninitiated = !entry.request.culture && entry.name.startsWith('Province ');
              return (
                <div key={key} style={rowStyle}>
                  <div
                    style={{
                      ...swatchStyle,
                      backgroundColor: `rgb(${entry.color.r},${entry.color.g},${entry.color.b})`,
                    }}
                  />
                  <span style={idStyle}>#{entry.id}</span>
                  <span style={nameStyle}>
                    {entry.name}
                    {isUninitiated && (
                      <span style={{ color: theme.accent.yellow, fontSize: theme.font.sizeXs, marginLeft: 4 }}>
                        needs details
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => onEdit(key)}
                    style={editBtnStyle}
                    title="Edit province details"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDelete(key)}
                    style={deleteBtnStyle}
                    title="Delete pending province (erases pixels)"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Save options — controls what gets written on Ctrl+S */}
          <div style={saveOptionsContainerStyle}>
            <div style={saveOptionsHeaderStyle}>On Save (Ctrl+S)</div>
            <label style={checkboxRowStyle}>
              <input type="checkbox" checked disabled style={checkboxStyle} />
              <span style={checkboxLabelStyle}>definition.csv entries</span>
              <span style={mandatoryBadgeStyle}>required</span>
            </label>
            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={saveOptions.historyStubs}
                onChange={() => toggleOption('historyStubs')}
                style={checkboxStyle}
              />
              <span style={checkboxLabelStyle}>History file stubs</span>
            </label>
            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={saveOptions.landedTitles}
                onChange={() => toggleOption('landedTitles')}
                style={checkboxStyle}
              />
              <span style={checkboxLabelStyle}>Landed titles entries</span>
            </label>
            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={saveOptions.terrainEntries}
                onChange={() => toggleOption('terrainEntries')}
                style={checkboxStyle}
              />
              <span style={checkboxLabelStyle}>Terrain entries</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────── */

const emptyStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: theme.font.sizeMd,
  fontFamily: theme.font.family,
};

const listContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space.xs,
  maxHeight: 320,
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
  borderRadius: theme.radius.sm,
  fontFamily: theme.font.family,
  fontSize: theme.font.sizeMd,
};

const swatchStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 16,
  height: 16,
  borderRadius: theme.radius.sm,
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
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const editBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: theme.text.muted,
  fontSize: theme.font.sizeMd,
  cursor: 'pointer',
  padding: `${theme.space.xs}px ${theme.space.sm}px`,
  borderRadius: theme.radius.sm,
  lineHeight: 1,
  flexShrink: 0,
};

const deleteBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: theme.text.muted,
  fontSize: theme.font.sizeSm,
  cursor: 'pointer',
  padding: `${theme.space.xs}px ${theme.space.sm}px`,
  borderRadius: theme.radius.sm,
  lineHeight: 1,
  flexShrink: 0,
};

const saveOptionsContainerStyle: React.CSSProperties = {
  marginTop: theme.space.lg,
  padding: theme.space.md,
  backgroundColor: theme.bg.base,
  border: `1px solid ${theme.border.muted}`,
  borderRadius: theme.radius.sm,
};

const saveOptionsHeaderStyle: React.CSSProperties = {
  color: theme.text.secondary,
  fontSize: theme.font.sizeSm,
  fontFamily: theme.font.family,
  fontWeight: 600,
  marginBottom: theme.space.sm,
};

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.space.sm,
  padding: `${theme.space.xs}px 0`,
  cursor: 'pointer',
  fontFamily: theme.font.family,
};

const checkboxStyle: React.CSSProperties = {
  accentColor: theme.accent.blue,
  margin: 0,
  flexShrink: 0,
};

const checkboxLabelStyle: React.CSSProperties = {
  color: theme.text.primary,
  fontSize: theme.font.sizeSm,
};

const mandatoryBadgeStyle: React.CSSProperties = {
  fontSize: theme.font.sizeXs,
  color: theme.text.muted,
  fontStyle: 'italic',
};
