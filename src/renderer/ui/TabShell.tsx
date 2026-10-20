/**
 * TabShell — Multi-tab container that manages isolated App instances.
 *
 * Each tab mounts its own App with independent TileEngine, ColorRegistry,
 * ToolManager, etc. Only the active tab's canvas is visible and rendering.
 * Maximum 4 simultaneous tabs; the "+" button disappears at the limit.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import App from './App';
import { reportSaveFailure } from './save-failure';
import type { SaveFailureReport } from '@shared/types';
import { theme } from './theme';
import { CopyPasteManager } from '@tools/copy-paste-manager';
import UnsavedTabsDialog from './components/UnsavedTabsDialog';
import type { DirtyTabEntry } from './components/UnsavedTabsDialog';

const MAX_TABS = 4;

interface TabInfo {
  id: number;
  label: string;
  dirty: boolean;
}

type CloseRequest = { kind: 'tab'; tabId: number } | { kind: 'window' };

let nextTabId = 1;

function createTab(): TabInfo {
  return { id: nextTabId++, label: `Map ${nextTabId - 1}`, dirty: false };
}

export default function TabShell() {
  const [tabs, setTabs] = useState<TabInfo[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<number>(tabs[0].id);
  const [hoveredTabId, setHoveredTabId] = useState<number | null>(null);
  const [hoveredPlus, setHoveredPlus] = useState(false);
  const [hoveredClose, setHoveredClose] = useState<number | null>(null);

  // Global copy-paste manager shared across all tabs
  const copyPasteManagerRef = useRef<CopyPasteManager>(new CopyPasteManager());

  // Track dirty state per tab for close guard
  const dirtyMapRef = useRef<Map<number, boolean>>(new Map());

  // Per-tab save callbacks registered by each App instance
  const saveCallbacks = useRef<Map<number, () => Promise<void>>>(new Map());

  // One guard owns tab and window closure, including single-tab windows.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const pendingCloseRef = useRef<CloseRequest | null>(null);
  const savingCloseRef = useRef(false);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);
  const [closeRequest, setCloseRequest] = useState<CloseRequest | null>(null);
  const [closeError, setCloseError] = useState<SaveFailureReport | null>(null);
  const [unsavedTabsSaving, setUnsavedTabsSaving] = useState(false);
  const [dirtyTabEntries, setDirtyTabEntries] = useState<DirtyTabEntry[]>([]);

  // Stable per-tab callbacks (avoid inline closures that change every render)
  const dirtyCallbacks = useRef<Map<number, (dirty: boolean) => void>>(new Map());
  const labelCallbacks = useRef<Map<number, (label: string) => void>>(new Map());
  const saveRegCallbacks = useRef<Map<number, (save: () => Promise<void>) => void>>(new Map());

  const handleTabDirtyChange = useCallback((tabId: number, dirty: boolean) => {
    if (dirtyMapRef.current.get(tabId) === dirty) return;
    dirtyMapRef.current.set(tabId, dirty);
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, dirty } : t));
  }, []);

  const handleTabLabelChange = useCallback((tabId: number, label: string) => {
    setTabs(prev => {
      const existing = prev.find(t => t.id === tabId);
      if (existing && existing.label === label) return prev;
      return prev.map(t => t.id === tabId ? { ...t, label } : t);
    });
  }, []);

  const getDirtyCallback = useCallback((tabId: number) => {
    if (!dirtyCallbacks.current.has(tabId)) {
      dirtyCallbacks.current.set(tabId, (dirty: boolean) => handleTabDirtyChange(tabId, dirty));
    }
    return dirtyCallbacks.current.get(tabId)!;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getLabelCallback = useCallback((tabId: number) => {
    if (!labelCallbacks.current.has(tabId)) {
      labelCallbacks.current.set(tabId, (label: string) => handleTabLabelChange(tabId, label));
    }
    return labelCallbacks.current.get(tabId)!;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getSaveRegCallback = useCallback((tabId: number) => {
    if (!saveRegCallbacks.current.has(tabId)) {
      saveRegCallbacks.current.set(tabId, (save: () => Promise<void>) => {
        saveCallbacks.current.set(tabId, save);
      });
    }
    return saveRegCallbacks.current.get(tabId)!;
  }, []);

  const handleAddTab = useCallback(() => {
    if (pendingCloseRef.current || tabs.length >= MAX_TABS) return;
    const tab = createTab();
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [tabs.length]);

  /** Remove only the approved tab after saving or an explicit discard. */
  const removeTab = useCallback((tabId: number) => {
    const current = tabsRef.current;
    if (current.length <= 1) return;
    const index = current.findIndex(tab => tab.id === tabId);
    if (index < 0) return;
    const next = current.filter(tab => tab.id !== tabId);
    dirtyMapRef.current.delete(tabId);
    dirtyCallbacks.current.delete(tabId);
    labelCallbacks.current.delete(tabId);
    saveCallbacks.current.delete(tabId);
    saveRegCallbacks.current.delete(tabId);
    tabsRef.current = next;
    setTabs(next);
    setActiveTabId(active => active === tabId ? next[Math.min(index, next.length - 1)].id : active);
  }, []);

  const requestClose = useCallback((request: CloseRequest) => {
    // A second close request cannot replace a decision or bypass an in-flight save.
    if (pendingCloseRef.current) return;
    const current = tabsRef.current;
    const targets = request.kind === 'window' ? current : current.filter(tab => tab.id === request.tabId);
    if (request.kind === 'tab' && (current.length <= 1 || targets.length === 0)) return;
    const dirty = targets.filter(tab => dirtyMapRef.current.get(tab.id))
      .map(tab => ({ tabId: tab.id, label: tab.label }));
    if (dirty.length === 0) {
      if (request.kind === 'tab') removeTab(request.tabId);
      else window.mapPainter.confirmClose();
      return;
    }
    pendingCloseRef.current = request;
    setDirtyTabEntries(dirty);
    setCloseError(null);
    setCloseRequest(request);
  }, [removeTab]);

  const handleCloseTab = useCallback((tabId: number) => requestClose({ kind: 'tab', tabId }), [requestClose]);

  useEffect(() => window.mapPainter.onCheckBeforeClose(() => requestClose({ kind: 'window' })), [requestClose]);

  // Prevent edits and tool shortcuts behind the modal while a close is pending.
  useEffect(() => {
    if (tabBarRef.current) tabBarRef.current.inert = closeRequest !== null;
    if (tabContentRef.current) tabContentRef.current.inert = closeRequest !== null;
  }, [closeRequest]);

  const completeClose = useCallback(() => {
    const request = pendingCloseRef.current;
    if (!request) return;
    pendingCloseRef.current = null;
    setCloseRequest(null);
    setCloseError(null);
    if (request.kind === 'tab') removeTab(request.tabId);
    else window.mapPainter.confirmClose();
  }, [removeTab]);

  const handleUnsavedTabsSave = useCallback(async (tabIdsToSave: Set<number>) => {
    if (!pendingCloseRef.current || savingCloseRef.current) return;
    savingCloseRef.current = true;
    setUnsavedTabsSaving(true);
    setCloseError(null);
    let savingLabel = '';
    try {
      for (const entry of dirtyTabEntries) {
        if (!tabIdsToSave.has(entry.tabId) || !dirtyMapRef.current.get(entry.tabId)) continue;
        savingLabel = entry.label;
        const save = saveCallbacks.current.get(entry.tabId);
        if (!save) throw new Error('The tab is not ready to save. Try again.');
        await save();
      }
      completeClose();
    } catch (error) {
      setCloseError(await reportSaveFailure(error, { operation: `save-draft-before-close (${savingLabel})` }));
    } finally {
      savingCloseRef.current = false;
      setUnsavedTabsSaving(false);
    }
  }, [dirtyTabEntries, completeClose]);

  const handleUnsavedTabsDiscard = useCallback(() => {
    if (!savingCloseRef.current) completeClose();
  }, [completeClose]);

  const handleUnsavedTabsCancel = useCallback(() => {
    if (savingCloseRef.current) return;
    pendingCloseRef.current = null;
    setCloseRequest(null);
    setCloseError(null);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Tab bar */}
      <div ref={tabBarRef} style={{
        height: 32,
        background: theme.bg.base,
        borderBottom: `1px solid ${theme.border.default}`,
        display: 'flex',
        alignItems: 'stretch',
        flexShrink: 0,
        paddingLeft: 4,
        gap: 1,
      }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isHovered = hoveredTabId === tab.id;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => { setHoveredTabId(null); setHoveredClose(null); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 12px',
                background: isActive ? theme.bg.panel : isHovered ? theme.bg.hover : 'transparent',
                borderRight: `1px solid ${theme.border.muted}`,
                borderBottom: isActive ? `2px solid ${theme.accent.blue}` : '2px solid transparent',
                cursor: 'pointer',
                minWidth: 100,
                maxWidth: 200,
                userSelect: 'none',
                transition: theme.transition.fast,
              }}
            >
              <span style={{
                flex: 1,
                fontSize: theme.font.sizeSm,
                fontFamily: theme.font.family,
                color: isActive ? theme.text.primary : theme.text.muted,
                fontWeight: isActive ? 600 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {tab.label}{tab.dirty ? ' •' : ''}
              </span>
              {tabs.length > 1 && (
                <button
                  type="button"
                  aria-label={`Close ${tab.label}`}
                  title={`Close ${tab.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  onMouseEnter={() => setHoveredClose(tab.id)}
                  onMouseLeave={() => setHoveredClose(null)}
                  style={{
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: 14,
                    lineHeight: 1,
                    color: hoveredClose === tab.id ? theme.text.primary : theme.text.muted,
                    borderRadius: theme.radius.sm,
                    width: 18,
                    height: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: hoveredClose === tab.id ? theme.bg.hover : 'transparent',
                    transition: theme.transition.fast,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Add tab button — hidden when at max */}
        {tabs.length < MAX_TABS && (
          <div
            onClick={handleAddTab}
            onMouseEnter={() => setHoveredPlus(true)}
            onMouseLeave={() => setHoveredPlus(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              cursor: 'pointer',
              color: hoveredPlus ? theme.text.primary : theme.text.muted,
              fontSize: 18,
              fontWeight: 300,
              background: hoveredPlus ? theme.bg.hover : 'transparent',
              borderRadius: theme.radius.sm,
              margin: '2px 4px',
              transition: theme.transition.fast,
              userSelect: 'none',
            }}
          >
            +
          </div>
        )}
      </div>

      {/* Tab content — all mounted, only active visible */}
      <div ref={tabContentRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              position: 'absolute',
              inset: 0,
              display: tab.id === activeTabId ? 'block' : 'none',
            }}
          >
            <App
              tabId={tab.id}
              isActive={tab.id === activeTabId}
              onDirtyStateChange={getDirtyCallback(tab.id)}
              onTabLabelChange={getLabelCallback(tab.id)}
              copyPasteManager={copyPasteManagerRef.current}
              onRegisterSave={getSaveRegCallback(tab.id)}
            />
          </div>
        ))}
      </div>

      {closeRequest && dirtyTabEntries.length > 0 && (
        <UnsavedTabsDialog
          dirtyTabs={dirtyTabEntries}
          closingTab={closeRequest.kind === 'tab'}
          error={closeError}
          onSave={handleUnsavedTabsSave}
          onDiscard={handleUnsavedTabsDiscard}
          onCancel={handleUnsavedTabsCancel}
          saving={unsavedTabsSaving}
        />
      )}
    </div>
  );
}
