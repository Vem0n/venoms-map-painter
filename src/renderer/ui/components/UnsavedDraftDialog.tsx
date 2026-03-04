/**
 * UnsavedDraftDialog — Prompt shown before destructive navigation when draft has unsaved changes.
 *
 * Offers three choices: Save Draft, Don't Save (discard), or Cancel.
 * Follows the same overlay/card pattern as PendingOrphanDialog.
 */

import { theme, cardStyle } from '../theme';

interface UnsavedDraftDialogProps {
  /** Save the current draft, then proceed with the pending action */
  onSaveDraft: () => void;
  /** Discard changes and proceed with the pending action */
  onDiscard: () => void;
  /** Cancel — go back to editing */
  onCancel: () => void;
}

export default function UnsavedDraftDialog({
  onSaveDraft,
  onDiscard,
  onCancel,
}: UnsavedDraftDialogProps) {
  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <h2 style={titleStyle}>Unsaved Draft Changes</h2>
        <p style={descStyle}>
          You have unsaved changes to your draft. What would you like to do?
        </p>

        <div style={footerStyle}>
          <button style={cancelBtnStyle} onClick={onCancel}>Cancel</button>
          <button style={discardBtnStyle} onClick={onDiscard}>Don't Save</button>
          <button style={saveBtnStyle} onClick={onSaveDraft}>Save Draft</button>
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
  maxWidth: 440,
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
