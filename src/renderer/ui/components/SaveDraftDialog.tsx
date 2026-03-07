/**
 * SaveDraftDialog — Small modal for naming a draft before saving.
 *
 * Shows a text input pre-filled with a default name and Save/Cancel buttons.
 * Follows the same overlay/card pattern as PendingOrphanDialog.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { theme, cardStyle, inputStyle } from '../theme';

interface SaveDraftDialogProps {
  /** Called with the user-provided draft name */
  onSave: (name: string) => void;
  onCancel: () => void;
  /** Pre-fill with the name of a previously loaded draft (for re-save) */
  defaultName?: string;
}

function formatDefaultName(): string {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `Draft - ${date} ${time}`;
}

export default function SaveDraftDialog({ onSave, onCancel, defaultName }: SaveDraftDialogProps) {
  const [name, setName] = useState(defaultName || formatDefaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus and select all text on mount
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  }, [name, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }, [handleSubmit, onCancel]);

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <h2 style={titleStyle}>Save Draft</h2>
        <p style={descStyle}>
          Save your current work as a draft. This does not modify mod files.
        </p>

        <label style={labelStyle}>Draft Name</label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          style={inputFieldStyle}
          maxLength={80}
        />

        <div style={footerStyle}>
          <p style={footnoteStyle}>This will save the draft for the active tab only.</p>
          <div style={{ display: 'flex', gap: theme.space.md }}>
            <button style={cancelBtnStyle} onClick={onCancel}>Cancel</button>
            <button
              style={name.trim() ? saveBtnStyle : saveBtnDisabledStyle}
              onClick={handleSubmit}
              disabled={!name.trim()}
            >
              Save Draft
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: theme.text.secondary,
  fontSize: theme.font.sizeSm,
  fontFamily: theme.font.family,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: theme.space.xs,
};

const inputFieldStyle: React.CSSProperties = {
  ...inputStyle(),
  width: '100%',
  boxSizing: 'border-box',
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

const saveBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.accent.green,
  color: '#fff',
};

const saveBtnDisabledStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.bg.elevated,
  color: theme.text.muted,
  cursor: 'not-allowed',
};
