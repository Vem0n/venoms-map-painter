import { useEffect, useRef } from 'react';
import { theme, cardStyle } from '../theme';

interface Props {
  modPath: string;
  differences: string[];
  missingSnapshot: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ModSaveDialog({ modPath, differences, missingSnapshot, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  const buttonStyle = { border: 'none', borderRadius: theme.radius.sm, padding: '8px 16px', cursor: 'pointer', fontFamily: theme.font.family, fontSize: theme.font.sizeMd };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="mod-save-title" onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onCancel(); }
      }} style={{ ...cardStyle(), padding: 24, width: 580, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}>
        <h2 id="mod-save-title">Save to Mod</h2>
        <p>This writes the current map and province data to the mod folder:</p>
        <p style={{ overflowWrap: 'anywhere', fontFamily: theme.font.mono }}>{modPath}</p>
        <p>Use Save Draft (Ctrl+S) to keep your work in VMP-Drafts without modifying mod files.</p>
        {missingSnapshot && <p style={{ color: theme.accent.yellow }}>This older draft has no definition snapshot. Its original province mapping cannot be verified against the mod.</p>}
        {differences.length > 0 && <>
          <p style={{ color: theme.accent.yellow }}>The mod’s definitions have changed since this work was loaded. Saving will overwrite them with this tab’s province data.</p>
          <ul>{differences.map((line, index) => <li key={index}>{line}</li>)}</ul>
        </>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button ref={cancelRef} onClick={onCancel} style={{ ...buttonStyle, background: theme.bg.elevated, color: theme.text.primary }}>Cancel</button>
          <button onClick={onConfirm} style={{ ...buttonStyle, background: theme.accent.blueStrong, color: "#fff" }}>Write to Mod</button>
        </div>
      </div>
    </div>
  );
}
