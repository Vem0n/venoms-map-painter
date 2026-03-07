/**
 * TabShell — Multi-tab container that manages isolated App instances.
 *
 * Each tab mounts its own App with independent TileEngine, ColorRegistry,
 * ToolManager, etc. Only the active tab's canvas is visible and rendering.
 * Maximum 4 simultaneous tabs; the "+" button disappears at the limit.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import App from './App';
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

  // Unsaved tabs dialog state
  const [showUnsavedTabsDialog, setShowUnsavedTabsDialog] = useState(false);
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
    if (tabs.length >= MAX_TABS) return;
    const tab = createTab();
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [tabs.length]);

  const handleCloseTab = useCallback((tabId: number) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev; // Never close the last tab
      const idx = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      dirtyMapRef.current.delete(tabId);
      dirtyCallbacks.current.delete(tabId);
      labelCallbacks.current.delete(tabId);
      saveCallbacks.current.delete(tabId);
      saveRegCallbacks.current.delete(tabId);
      // If closing the active tab, switch to the nearest neighbor
      if (tabId === activeTabId) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx].id);
      }
      return next;
    });
  }, [activeTabId]);

  // Close-window guard: show UnsavedTabsDialog when any tab is dirty
  useEffect(() => {
    const cleanup = window.mapPainter.onCheckBeforeClose(() => {
      // Collect dirty tabs
      const dirty: DirtyTabEntry[] = [];
      for (const tab of tabs) {
        if (dirtyMapRef.current.get(tab.id)) {
          dirty.push({ tabId: tab.id, label: tab.label });
        }
      }

      if (dirty.length === 0) {
        window.mapPainter.confirmClose();
      } else {
        setDirtyTabEntries(dirty);
        setShowUnsavedTabsDialog(true);
      }
    });
    return cleanup;
  }, [tabs]);

  const handleUnsavedTabsSave = useCallback(async (tabIdsToSave: Set<number>) => {
    setUnsavedTabsSaving(true);
    try {
      // Save selected tabs sequentially
      for (const tabId of tabIdsToSave) {
        const saveFn = saveCallbacks.current.get(tabId);
        if (saveFn) await saveFn();
      }
    } catch (err) {
      console.error('Save error during close:', err);
    }
    setUnsavedTabsSaving(false);
    setShowUnsavedTabsDialog(false);
    window.mapPainter.confirmClose();
  }, []);

  const handleUnsavedTabsDiscard = useCallback(() => {
    setShowUnsavedTabsDialog(false);
    window.mapPainter.confirmClose();
  }, []);

  const handleUnsavedTabsCancel = useCallback(() => {
    setShowUnsavedTabsDialog(false);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Tab bar */}
      <div style={{
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
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  onMouseEnter={() => setHoveredClose(tab.id)}
                  onMouseLeave={() => setHoveredClose(null)}
                  style={{
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
                </span>
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
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
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
              isMultiTab={tabs.length > 1}
              copyPasteManager={copyPasteManagerRef.current}
              onRegisterSave={getSaveRegCallback(tab.id)}
            />
          </div>
        ))}
      </div>

      {showUnsavedTabsDialog && dirtyTabEntries.length > 0 && (
        <UnsavedTabsDialog
          dirtyTabs={dirtyTabEntries}
          onSave={handleUnsavedTabsSave}
          onDiscard={handleUnsavedTabsDiscard}
          onCancel={handleUnsavedTabsCancel}
          saving={unsavedTabsSaving}
        />
      )}
    </div>
  );
}
