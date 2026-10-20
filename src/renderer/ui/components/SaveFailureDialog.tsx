import { useEffect, useRef } from 'react';
import type { SaveFailureReport } from '@shared/types';
import { theme, cardStyle, inputStyle } from '../theme';

export function SaveFailureNotice({ failure, draftSave }: { failure: SaveFailureReport; draftSave: boolean }) {
  return (
    <div role="alert" style={{ color: theme.text.primary, lineHeight: 1.5 }}>
      {failure.logPath ? <>
        <p>The error log has been saved at:</p>
        <input data-save-error-log-path aria-label="Error log path" readOnly value={failure.logPath}
          onFocus={event => event.currentTarget.select()} style={{ ...inputStyle(), width: '100%', boxSizing: 'border-box' }} />
        <p>Please inspect it for further information.</p>
      </> : <p style={{ color: theme.accent.yellow }}>The error log could not be saved or retrieved. The error details are shown below.</p>}
      <p>{draftSave
        ? 'The draft could not be saved. You can retry, return to editing and try another draft name, or explicitly close without saving.'
        : 'Consider saving a draft instead to preserve your work without modifying mod files.'}</p>
      <details>
        <summary>Error details</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: theme.font.sizeSm }}>{failure.message}{failure.logError ? `\n\nLog error: ${failure.logError}` : ''}</pre>
      </details>
    </div>
  );
}

export default function SaveFailureDialog({ failure, draftSave, onDismiss, onSaveDraft }: {
  failure: SaveFailureReport;
  draftSave: boolean;
  onDismiss: () => void;
  onSaveDraft: () => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { backRef.current?.focus(); }, []);
  const buttonStyle = { border: 'none', borderRadius: theme.radius.sm, padding: '8px 14px', cursor: 'pointer', fontFamily: theme.font.family, fontSize: theme.font.sizeMd };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 15000 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="save-failure-title" style={{ ...cardStyle(), width: 580, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', padding: 24 }} onKeyDown={event => {
        event.stopPropagation();
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') event.preventDefault();
        if (event.key === 'Escape') { event.preventDefault(); onDismiss(); }
      }}>
        <h2 id="save-failure-title" style={{ color: theme.accent.red }}>Saving has failed</h2>
        <SaveFailureNotice failure={failure} draftSave={draftSave} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
          <button ref={backRef} style={{ ...buttonStyle, background: theme.bg.elevated, color: theme.text.primary }} onClick={onDismiss}>Back to Editing</button>
          <button style={{ ...buttonStyle, background: theme.accent.green, color: '#fff' }} onClick={onSaveDraft}>{draftSave ? 'Try Another Draft Save' : 'Save Draft Instead'}</button>
        </div>
      </div>
    </div>
  );
}
