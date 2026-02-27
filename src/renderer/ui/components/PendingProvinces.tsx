/**
 * PendingProvinces — 4th sidebar tab showing provinces created but not yet saved.
 *
 * Displays the pending province list with color swatches, IDs, and names.
 * Provides save options (which file stubs to generate) and a save button.
 */

import { theme, sectionHeading, dividerStyle } from '../theme';
import { rgbToKey } from '@shared/types';
import type { PendingSaveOptions } from '@shared/types';
import type { PendingProvinceMap } from '@registry/pending-province-map';

interface PendingProvincesProps {
  pendingMap: PendingProvinceMap;
  onRemove: (colorKey: string) => void;
  onEdit: (colorKey: string) => void;
  saveOptions: PendingSaveOptions;
  onSaveOptionsChange: (options: PendingSaveOptions) => void;
  onFlushSave: () => void;
  modLoaded: boolean;
}

export default function PendingProvinces({
  pendingMap,
  onRemove,
  onEdit,
  saveOptions,
  onSaveOptionsChange,
  onFlushSave,
  modLoaded,
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
                    onClick={() => onRemove(key)}
                    style={deleteBtnStyle}
                    title="Remove pending province"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <div style={dividerStyle()} />

          <h4 style={optionsHeadingStyle}>Save Options</h4>
          <div style={optionsContainerStyle}>
            <CheckboxRow
              label="Definition.csv entries"
              checked={saveOptions.definitionCsv}
              onChange={() => {/* always true — mandatory */}}
              disabled
            />
            <CheckboxRow
              label="History stubs"
              checked={saveOptions.historyStubs}
              onChange={v => onSaveOptionsChange({ ...saveOptions, historyStubs: v })}
            />
            <CheckboxRow
              label="Landed titles entries"
              checked={saveOptions.landedTitles}
              onChange={v => onSaveOptionsChange({ ...saveOptions, landedTitles: v })}
            />
            <CheckboxRow
              label="Terrain entries"
              checked={saveOptions.terrainEntries}
              onChange={v => onSaveOptionsChange({ ...saveOptions, terrainEntries: v })}
            />
          </div>

          <button onClick={onFlushSave} style={saveBtnStyle}>
            Save All ({entries.length} pending)
          </button>

          <p style={infoStyle}>IDs are reconciled sequentially before save</p>
        </>
      )}
    </div>
  );
}

/* ── CheckboxRow ──────────────────────────────────────── */

function CheckboxRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: theme.space.md,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      fontFamily: theme.font.family,
      fontSize: theme.font.sizeMd,
      color: theme.text.secondary,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(!checked)}
        disabled={disabled}
      />
      {label}
    </label>
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

const optionsHeadingStyle: React.CSSProperties = {
  color: theme.text.primary,
  fontSize: theme.font.sizeLg,
  fontWeight: 600,
  fontFamily: theme.font.family,
  margin: `0 0 ${theme.space.md}px`,
};

const optionsContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space.sm + 2,
  marginBottom: theme.space.lg,
};

const saveBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: `${theme.space.md}px ${theme.space.xl}px`,
  borderRadius: theme.radius.sm,
  fontSize: theme.font.sizeMd,
  fontFamily: theme.font.family,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  backgroundColor: theme.accent.green,
  color: '#fff',
  marginBottom: theme.space.md,
};

const infoStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: theme.font.sizeXs,
  fontFamily: theme.font.family,
  textAlign: 'center',
};
