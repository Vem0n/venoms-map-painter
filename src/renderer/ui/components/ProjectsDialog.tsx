import { useEffect, useRef, useState } from 'react';
import type { ProjectLibrary, WorkshopProject } from '@shared/types';
import { theme, cardStyle, inputStyle } from '../theme';

interface Props {
  onOpenProject: (project: WorkshopProject) => void;
  onLoadDraft: (project: WorkshopProject) => void;
  onClose: () => void;
}

export default function ProjectsDialog({ onOpenProject, onLoadDraft, onClose }: Props) {
  const [library, setLibrary] = useState<ProjectLibrary | null>(null);
  const [busy, setBusy] = useState(true);
  const [activity, setActivity] = useState('Loading projects…');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    window.mapPainter.getProjectLibrary().then(value => { if (mounted.current) setLibrary(value); })
      .catch(reason => { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (mounted.current) { setBusy(false); searchRef.current?.focus(); } });
    return () => { mounted.current = false; };
  }, []);

  const update = async (action: () => Promise<ProjectLibrary | null>, activity = 'Scanning…') => {
    if (busy) return;
    setBusy(true);
    setActivity(activity);
    setError(null);
    try {
      const value = await action();
      if (value && mounted.current) setLibrary(value);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const needle = query.trim().toLocaleLowerCase();
  const projects = library?.projects.filter(project => `${project.name} ${project.workshopId} ${project.modPath}`.toLocaleLowerCase().includes(needle)) ?? [];
  const selected = projects.find(project => project.modPath === selectedPath);
  const canOpen = !!selected?.available && !busy;
  const buttonStyle = { border: 'none', borderRadius: theme.radius.sm, padding: '7px 12px', cursor: 'pointer', fontFamily: theme.font.family, fontSize: theme.font.sizeMd, background: theme.bg.elevated, color: theme.text.primary };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="projects-title" style={{ ...cardStyle(), width: 780, maxWidth: '92vw', maxHeight: '88vh', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }} onKeyDown={event => {
        event.stopPropagation();
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') event.preventDefault();
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        if (event.key === 'Tab') {
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
          const first = controls[0]; const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <h2 id="projects-title" style={{ margin: 0, fontSize: 18 }}>Projects</h2>
        <p style={{ margin: 0, color: theme.text.secondary, lineHeight: 1.5 }}>
          Add the game’s Workshop content folder—the folder containing numbered mod folders. VMP lists mods with both a province map and definitions.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={buttonStyle} disabled={busy} onClick={() => void update(() => window.mapPainter.addWorkshopFolder())}>Add Workshop Folder</button>
          <button style={buttonStyle} disabled={busy || !library?.workshopFolders.length} onClick={() => void update(() => window.mapPainter.rescanProjectLibrary())}>Rescan</button>
          <span role="status" style={{ color: theme.text.secondary }}>{busy ? activity : `${library?.projects.length ?? 0} projects`}</span>
        </div>
        {!!library?.workshopFolders.length && <div style={{ maxHeight: 90, overflowY: 'auto', flexShrink: 0 }}>
          {library.workshopFolders.map(folder => <div key={folder} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ flex: 1, color: theme.text.secondary, overflowWrap: 'anywhere', fontSize: theme.font.sizeSm }}>{folder}</span>
            <button style={{ ...buttonStyle, padding: '3px 8px' }} disabled={busy} title="Forget this folder in VMP; mod files, drafts and backups are not deleted" onClick={() => void update(() => window.mapPainter.removeWorkshopFolder(folder), 'Updating projects…')}>Remove Folder</button>
          </div>)}
        </div>}
        {error && <p role="alert" style={{ color: theme.accent.red, margin: 0, overflowWrap: 'anywhere' }}>{error}</p>}
        {!!library?.warnings.length && <details style={{ color: theme.accent.yellow }}><summary>{library.warnings.length} scan warning{library.warnings.length === 1 ? '' : 's'}</summary>
          <ul style={{ maxHeight: 100, overflowY: 'auto' }}>{library.warnings.map((warning, index) => <li key={index} style={{ overflowWrap: 'anywhere' }}>{warning}</li>)}</ul>
        </details>}
        <input ref={searchRef} aria-label="Search projects" placeholder="Search by mod name, Workshop ID or path…" value={query} onChange={event => setQuery(event.target.value)} style={{ ...inputStyle(), width: '100%', boxSizing: 'border-box' }} />
        <div role="listbox" aria-label="Workshop projects" style={{ minHeight: 180, maxHeight: '40vh', overflowY: 'auto', border: `1px solid ${theme.border.default}`, borderRadius: theme.radius.sm, background: theme.bg.base }}>
          {projects.map(project => <button key={project.modPath} role="option" aria-selected={selectedPath === project.modPath} data-project-path={project.modPath}
            onClick={() => setSelectedPath(project.modPath)} onDoubleClick={() => { if (project.available && !busy) onOpenProject(project); }}
            style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${theme.border.muted}`, padding: '12px 14px', cursor: 'pointer', background: selectedPath === project.modPath ? theme.bg.active : 'transparent', color: theme.text.primary, fontFamily: theme.font.family }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: theme.font.sizeXl }}>
              <strong style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{project.name}</strong><span style={{ color: project.available ? theme.text.secondary : theme.accent.yellow, fontSize: theme.font.sizeMd }}>{project.available ? `Workshop ${project.workshopId}` : 'Unavailable — rescan when the folder is accessible'}</span>
            </div>
            <div style={{ marginTop: 5, color: theme.text.secondary, fontSize: theme.font.sizeSm, overflowWrap: 'anywhere' }}>{project.modPath}</div>
          </button>)}
          {!projects.length && !busy && <p style={{ padding: 16, margin: 0, color: theme.text.secondary }}>
            {!library?.workshopFolders.length ? 'Add a Workshop folder to discover projects.' : needle ? 'No projects match your search.' : 'No map projects found. Choose the game’s content folder containing the mod folders, then rescan.'}
          </p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: theme.text.secondary, fontSize: theme.font.sizeSm }}>
            Drafts and backups stay inside each mod folder.
            {library?.lastScannedAt && <span style={{ display: 'block', marginTop: 4 }}>Last scanned: {new Date(library.lastScannedAt).toLocaleString()}</span>}
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={buttonStyle} onClick={onClose}>Close</button>
            <button style={buttonStyle} disabled={!canOpen} onClick={() => { if (selected) onLoadDraft(selected); }}>Load Project Draft</button>
            <button style={{ ...buttonStyle, background: canOpen ? theme.accent.blueStrong : theme.bg.elevated }} disabled={!canOpen} onClick={() => { if (selected) onOpenProject(selected); }}>Open Project</button>
          </div>
        </div>
      </div>
    </div>
  );
}
