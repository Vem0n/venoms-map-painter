/**
 * IdDriftDialog — Warning modal shown when definition.csv on disk
 * has a different max province ID than the in-memory registry.
 *
 * Displays the list of pending province ID remaps and asks the user
 * to confirm or cancel the save.
 */

import { theme, cardStyle } from '../theme';

interface IdDriftDialogProps {
  remaps: Array<{ oldId: number; newId: number }>;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function IdDriftDialog({ remaps, onConfirm, onCancel }: IdDriftDialogProps) {
  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <h2 style={titleStyle}>ID Drift Detected</h2>
        <p style={descStyle}>
          Province IDs on disk differ from in-memory state.
          The following pending provinces will be remapped before save to ensure sequentiality:
        </p>

        <div style={listContainerStyle}>
          {remaps.map(({ oldId, newId }) => (
            <div key={oldId} style={rowStyle}>
              <span style={idStyle}>#{oldId}</span>
              <span style={arrowStyle}>&rarr;</span>
              <span style={newIdStyle}>#{newId}</span>
            </div>
          ))}
        </div>

        <div style={footerStyle}>
          <button style={cancelBtnStyle} onClick={onCancel}>Cancel</button>
          <button style={confirmBtnStyle} onClick={onConfirm}>Continue with Save</button>
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
  maxWidth: 480,
  width: '90%',
  boxShadow: theme.shadow.dropdown,
};

const titleStyle: React.CSSProperties = {
  color: theme.accent.yellow,
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

const listContainerStyle: React.CSSProperties = {
  maxHeight: 200,
  overflowY: 'auto',
  backgroundColor: theme.bg.base,
  border: `1px solid ${theme.border.muted}`,
  borderRadius: theme.radius.sm,
  padding: theme.space.sm,
  marginBottom: theme.space.lg,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.space.md,
  padding: `${theme.space.xs}px ${theme.space.sm}px`,
  fontFamily: theme.font.mono,
  fontSize: theme.font.sizeMd,
};

const idStyle: React.CSSProperties = {
  color: theme.text.muted,
};

const arrowStyle: React.CSSProperties = {
  color: theme.text.muted,
};

const newIdStyle: React.CSSProperties = {
  color: theme.accent.blue,
  fontWeight: 600,
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: theme.space.md,
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
  backgroundColor: theme.accent.green,
  color: '#fff',
};
