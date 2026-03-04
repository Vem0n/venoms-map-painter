/**
 * LoadingOverlay — Full-screen modal with a circular spinner and status message.
 *
 * Blocks all interaction while loading operations (map load, draft load, sector
 * population) are in progress. Uses the same overlay pattern as other dialogs.
 */

import { theme } from '../theme';

interface LoadingOverlayProps {
  message: string;
}

export default function LoadingOverlay({ message }: LoadingOverlayProps) {
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={spinnerContainerStyle}>
          <svg
            width={48}
            height={48}
            viewBox="0 0 48 48"
            style={spinnerStyle}
          >
            <circle
              cx={24}
              cy={24}
              r={20}
              fill="none"
              stroke={theme.bg.elevated}
              strokeWidth={4}
            />
            <circle
              cx={24}
              cy={24}
              r={20}
              fill="none"
              stroke={theme.accent.blue}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="80 45"
            />
          </svg>
        </div>
        <p style={messageStyle}>{message}</p>
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
  zIndex: 1100,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: theme.bg.panel,
  border: `1px solid ${theme.border.default}`,
  borderRadius: theme.radius.lg,
  padding: `${theme.space.xxl}px ${theme.space.xxl + 8}px`,
  boxShadow: theme.shadow.dropdown,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: theme.space.xl,
  minWidth: 240,
};

const spinnerContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const spinnerStyle: React.CSSProperties = {
  animation: 'vmp-spin 1s linear infinite',
};

const messageStyle: React.CSSProperties = {
  color: theme.text.secondary,
  fontSize: theme.font.sizeLg,
  fontFamily: theme.font.family,
  margin: 0,
  textAlign: 'center',
  lineHeight: 1.4,
};

/* Inject keyframes once — CSS animation for the spinner rotation */
if (typeof document !== 'undefined') {
  const styleId = 'vmp-loading-spinner-keyframes';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@keyframes vmp-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }
}
