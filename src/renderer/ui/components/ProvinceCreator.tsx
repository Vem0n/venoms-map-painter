/**
 * ProvinceCreator — Form for creating a new province/barony.
 *
 * Creates all required CK3 mod files:
 * - definition.csv row (sequential ID, RGB, name)
 * - history/provinces/ entry (culture, religion, holding)
 * - common/landed_titles/ barony under chosen parent county
 * - common/province_terrain/ entry
 *
 * Supports both selecting an existing county OR creating a brand new one.
 * The color is taken from the currently active paint color.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { RGB, ProvinceData, CreateProvinceRequest, LandedTitleNode, PendingProvince } from '@shared/types';
import { rgbToKey } from '@shared/types';
import { theme, inputStyle as themeInputStyle, labelStyle as themeLabelStyle, selectStyle, sectionHeading, dividerStyle, cardStyle } from '../theme';
import { ChevronDownIcon } from './icons';

const TERRAIN_TYPES = [
  'plains', 'farmlands', 'hills', 'mountains', 'desert', 'desert_mountains',
  'oasis', 'forest', 'taiga', 'taiga_bog', 'jungle', 'wetlands', 'steppe',
  'floodplains', 'drylands', 'cloudforest', 'highlands',
  'the_bog', 'frozen_flats', 'glacier', 'urban',
];

interface ProvinceCreatorProps {
  /** Current active paint color — will be the new province's color */
  activeColor: RGB;
  /** All landed title trees (for parent county selection) */
  landedTitles: LandedTitleNode[];
  /** Callback to create the province */
  onCreate: (request: CreateProvinceRequest) => Promise<ProvinceData | null>;
  /** Whether a mod is loaded */
  modLoaded: boolean;
  /** List of existing history files in the mod */
  historyFiles: string[];
  /** When set, the form edits this existing pending province instead of creating a new one */
  editingProvince?: PendingProvince | null;
  /** Callback to update a pending province's details */
  onUpdate?: (colorKey: string, request: CreateProvinceRequest) => void;
  /** Callback to cancel editing */
  onCancelEdit?: () => void;
}

const fieldRowStyle: React.CSSProperties = {
  marginBottom: 8,
};

type CountyMode = 'existing' | 'new';

export default function ProvinceCreator({
  activeColor,
  landedTitles,
  onCreate,
  modLoaded,
  historyFiles,
  editingProvince,
  onUpdate,
  onCancelEdit,
}: ProvinceCreatorProps) {
  const [name, setName] = useState('');
  const [countyMode, setCountyMode] = useState<CountyMode>('existing');
  // Existing county selection
  const [parentTitle, setParentTitle] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [showCountyDropdown, setShowCountyDropdown] = useState(false);
  const [hoveredCounty, setHoveredCounty] = useState(-1);
  // New county creation
  const [newCountyKey, setNewCountyKey] = useState('');
  const [parentDuchy, setParentDuchy] = useState('');
  const [duchySearch, setDuchySearch] = useState('');
  const [showDuchyDropdown, setShowDuchyDropdown] = useState(false);
  const [hoveredDuchy, setHoveredDuchy] = useState(-1);

  const [holding, setHolding] = useState('castle_holding');
  const [culture, setCulture] = useState('');
  const [religion, setReligion] = useState('');
  const [terrain, setTerrain] = useState('plains');
  const [creating, setCreating] = useState(false);
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedHistoryFile, setSelectedHistoryFile] = useState('');
  const countyDropdownRef = useRef<HTMLDivElement>(null);
  const duchyDropdownRef = useRef<HTMLDivElement>(null);

  // Build flat list of county titles for parent selection
  const countyTitles = useMemo((): { key: string; path: string }[] => {
    const results: { key: string; path: string }[] = [];
    function walk(node: LandedTitleNode, trail: string[]): void {
      const currentTrail = [...trail, node.key];
      if (node.tier === 'c') {
        results.push({ key: node.key, path: currentTrail.join(' > ') });
      }
      for (const child of node.children) {
        walk(child, currentTrail);
      }
    }
    for (const t of landedTitles) walk(t, []);
    return results;
  }, [landedTitles]);

  // Build flat list of duchy titles for new county parent selection
  const duchyTitles = useMemo((): { key: string; path: string }[] => {
    const results: { key: string; path: string }[] = [];
    function walk(node: LandedTitleNode, trail: string[]): void {
      const currentTrail = [...trail, node.key];
      if (node.tier === 'd') {
        results.push({ key: node.key, path: currentTrail.join(' > ') });
      }
      for (const child of node.children) {
        walk(child, currentTrail);
      }
    }
    for (const t of landedTitles) walk(t, []);
    return results;
  }, [landedTitles]);

  // Filter counties by search
  const filteredCounties = useMemo(() => {
    if (!parentSearch) return countyTitles.slice(0, 30);
    const lower = parentSearch.toLowerCase();
    return countyTitles.filter(c =>
      c.key.toLowerCase().includes(lower) || c.path.toLowerCase().includes(lower)
    ).slice(0, 30);
  }, [countyTitles, parentSearch]);

  // Filter duchies by search
  const filteredDuchies = useMemo(() => {
    if (!duchySearch) return duchyTitles.slice(0, 30);
    const lower = duchySearch.toLowerCase();
    return duchyTitles.filter(d =>
      d.key.toLowerCase().includes(lower) || d.path.toLowerCase().includes(lower)
    ).slice(0, 30);
  }, [duchyTitles, duchySearch]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (countyDropdownRef.current && !countyDropdownRef.current.contains(e.target as Node)) {
        setShowCountyDropdown(false);
      }
      if (duchyDropdownRef.current && !duchyDropdownRef.current.contains(e.target as Node)) {
        setShowDuchyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-generate county key from province name
  useEffect(() => {
    if (countyMode === 'new' && name.trim() && !newCountyKey) {
      setNewCountyKey(`c_${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
    }
  }, [name, countyMode, newCountyKey]);

  // Pre-populate form when editing an existing pending province
  useEffect(() => {
    if (!editingProvince) return;
    const req = editingProvince.request;
    setName(req.name || '');
    setCulture(req.culture || '');
    setReligion(req.religion || '');
    setHolding(req.holding || 'castle_holding');
    setTerrain(req.terrain || 'plains');
    setSelectedHistoryFile(req.historyFile || '');
    if (req.createCounty && req.parentTitle) {
      setCountyMode('new');
      setNewCountyKey(req.parentTitle);
      setParentDuchy(req.parentDuchy || '');
    } else if (req.parentTitle) {
      setCountyMode('existing');
      setParentTitle(req.parentTitle);
    } else {
      setCountyMode('existing');
      setParentTitle('');
    }
  }, [editingProvince]);

  const isEditing = !!editingProvince;
  const displayColor = isEditing ? editingProvince.color : activeColor;

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) return;

    const request: CreateProvinceRequest = {
      name: name.trim(),
      color: displayColor,
      titleTier: 'b',
      culture: culture || undefined,
      religion: religion || undefined,
      holding: holding || undefined,
      terrain: terrain || undefined,
      historyFile: selectedHistoryFile || undefined,
    };

    if (countyMode === 'existing' && parentTitle) {
      request.parentTitle = parentTitle;
    } else if (countyMode === 'new' && newCountyKey.trim()) {
      const key = newCountyKey.trim().startsWith('c_') ? newCountyKey.trim() : `c_${newCountyKey.trim()}`;
      request.parentTitle = key;
      request.createCounty = true;
      request.parentDuchy = parentDuchy || undefined;
    }

    if (isEditing && onUpdate) {
      // Update existing pending province
      onUpdate(rgbToKey(editingProvince!.color), request);
      setLastCreated(`Updated province #${editingProvince!.id}: ${request.name}`);
    } else {
      // Create new province
      setCreating(true);
      setLastCreated(null);
      const result = await onCreate(request);
      setCreating(false);
      if (result) {
        setLastCreated(`Created province #${result.id}: ${result.name}`);
        setName('');
        setNewCountyKey('');
      }
    }
  }, [name, displayColor, countyMode, parentTitle, newCountyKey, parentDuchy, culture, religion, holding, terrain, selectedHistoryFile, onCreate, isEditing, onUpdate, editingProvince]);

  if (!modLoaded) {
    return (
      <div>
        <h3 style={sectionHeading()}>Create Province</h3>
        <p style={{ color: theme.text.muted, fontSize: theme.font.sizeMd }}>Load a mod first</p>
      </div>
    );
  }

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    maxHeight: 200,
    overflowY: 'auto',
    background: theme.bg.elevated,
    border: `1px solid ${theme.border.default}`,
    borderRadius: theme.radius.sm,
    boxShadow: theme.shadow.dropdown,
    zIndex: 10,
  };

  const canSubmit = name.trim().length > 0;

  return (
    <div>
      <h3 style={sectionHeading()}>
        {isEditing ? `Edit Province #${editingProvince!.id}` : 'Create Province'}
      </h3>

      {/* Color preview */}
      <div style={{
        ...cardStyle(),
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: theme.space.lg,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: theme.radius.sm,
          border: `2px solid ${theme.border.default}`,
          background: `rgb(${displayColor.r},${displayColor.g},${displayColor.b})`,
          flexShrink: 0,
        }} />
        <div>
          <div style={{ color: theme.text.secondary, fontSize: theme.font.sizeSm, fontFamily: theme.font.mono }}>
            ({displayColor.r}, {displayColor.g}, {displayColor.b})
          </div>
          <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs }}>
            {isEditing ? 'Editing pending province' : 'Paint pixels first, then create'}
          </div>
        </div>
      </div>

      {/* Province Name */}
      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Province Name *</div>
        <input
          style={themeInputStyle()}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. London"
        />
      </div>

      {/* County Mode Toggle — mini tab bar with underline */}
      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Parent County</div>
        <div style={{ position: 'relative', display: 'flex', marginBottom: 6, borderBottom: `1px solid ${theme.border.muted}` }}>
          {(['existing', 'new'] as CountyMode[]).map((mode, i) => (
            <button
              key={mode}
              onClick={() => setCountyMode(mode)}
              style={{
                flex: 1,
                padding: '6px 0',
                background: 'transparent',
                color: countyMode === mode ? theme.text.primary : theme.text.muted,
                border: 'none',
                cursor: 'pointer',
                fontSize: theme.font.sizeSm,
                fontFamily: theme.font.family,
                fontWeight: countyMode === mode ? 600 : 400,
                transition: theme.transition.fast,
              }}
            >
              {mode === 'existing' ? 'Existing County' : 'New County'}
            </button>
          ))}
          {/* Sliding underline */}
          <div style={{
            position: 'absolute',
            bottom: -1,
            left: countyMode === 'existing' ? '0%' : '50%',
            width: '50%',
            height: 2,
            background: theme.accent.blue,
            transition: 'left 0.25s ease',
          }} />
        </div>

        {countyMode === 'existing' && (
          <div ref={countyDropdownRef}>
            <input
              style={themeInputStyle()}
              value={parentSearch || parentTitle}
              onChange={e => {
                setParentSearch(e.target.value);
                setParentTitle('');
                setShowCountyDropdown(true);
              }}
              onFocus={() => setShowCountyDropdown(true)}
              placeholder="Search county (e.g. c_cambridge)"
            />
            {showCountyDropdown && (
              <div style={{ position: 'relative' }}>
                <div style={dropdownStyle}>
                  {filteredCounties.map((c, i) => (
                    <div
                      key={c.key}
                      onMouseEnter={() => setHoveredCounty(i)}
                      onMouseLeave={() => setHoveredCounty(-1)}
                      style={{
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: theme.font.sizeSm,
                        borderBottom: `1px solid ${theme.border.muted}`,
                        color: theme.text.primary,
                        background: hoveredCounty === i ? theme.bg.hover : 'transparent',
                        transition: theme.transition.fast,
                      }}
                      onMouseDown={e => {
                        e.preventDefault();
                        setParentTitle(c.key);
                        setParentSearch('');
                        setShowCountyDropdown(false);
                      }}
                    >
                      <div style={{ fontFamily: theme.font.mono }}>{c.key}</div>
                      <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs }}>{c.path}</div>
                    </div>
                  ))}
                  {filteredCounties.length === 0 && (
                    <div style={{ padding: '4px 8px', color: theme.text.muted, fontSize: theme.font.sizeSm }}>
                      No counties found
                    </div>
                  )}
                </div>
              </div>
            )}
            {parentTitle && (
              <div style={{ color: theme.accent.green, fontSize: theme.font.sizeXs, marginTop: 2 }}>
                Selected: {parentTitle}
              </div>
            )}
          </div>
        )}

        {countyMode === 'new' && (
          <div>
            <input
              style={themeInputStyle()}
              value={newCountyKey}
              onChange={e => setNewCountyKey(e.target.value)}
              placeholder="e.g. c_london"
            />
            <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs, marginTop: 2 }}>
              Will create this county in landed_titles with the barony inside
            </div>

            {/* Optional parent duchy */}
            <div style={{ marginTop: 6 }} ref={duchyDropdownRef}>
              <div style={{ ...themeLabelStyle(), marginTop: 4 }}>Parent Duchy (optional)</div>
              <input
                style={themeInputStyle()}
                value={duchySearch || parentDuchy}
                onChange={e => {
                  setDuchySearch(e.target.value);
                  setParentDuchy('');
                  setShowDuchyDropdown(true);
                }}
                onFocus={() => setShowDuchyDropdown(true)}
                placeholder="Search duchy (e.g. d_jylland)"
              />
              {showDuchyDropdown && (
                <div style={{ position: 'relative' }}>
                  <div style={dropdownStyle}>
                    {filteredDuchies.map((d, i) => (
                      <div
                        key={d.key}
                        onMouseEnter={() => setHoveredDuchy(i)}
                        onMouseLeave={() => setHoveredDuchy(-1)}
                        style={{
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: theme.font.sizeSm,
                          borderBottom: `1px solid ${theme.border.muted}`,
                          color: theme.text.primary,
                          background: hoveredDuchy === i ? theme.bg.hover : 'transparent',
                          transition: theme.transition.fast,
                        }}
                        onMouseDown={e => {
                          e.preventDefault();
                          setParentDuchy(d.key);
                          setDuchySearch('');
                          setShowDuchyDropdown(false);
                        }}
                      >
                        <div style={{ fontFamily: theme.font.mono }}>{d.key}</div>
                        <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs }}>{d.path}</div>
                      </div>
                    ))}
                    {filteredDuchies.length === 0 && (
                      <div style={{ padding: '4px 8px', color: theme.text.muted, fontSize: theme.font.sizeSm }}>
                        No duchies found
                      </div>
                    )}
                  </div>
                </div>
              )}
              {parentDuchy && (
                <div style={{ color: theme.accent.green, fontSize: theme.font.sizeXs, marginTop: 2 }}>
                  Selected: {parentDuchy}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Holding */}
      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Holding Type</div>
        <select
          style={selectStyle()}
          value={holding}
          onChange={e => setHolding(e.target.value)}
        >
          <option value="castle_holding">Castle</option>
          <option value="city_holding">City</option>
          <option value="church_holding">Church</option>
          <option value="tribal_holding">Tribal</option>
          <option value="none">None</option>
        </select>
      </div>

      {/* Culture */}
      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Culture</div>
        <input
          style={themeInputStyle()}
          value={culture}
          onChange={e => setCulture(e.target.value)}
          placeholder="e.g. english"
        />
      </div>

      {/* Religion */}
      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Religion</div>
        <input
          style={themeInputStyle()}
          value={religion}
          onChange={e => setReligion(e.target.value)}
          placeholder="e.g. catholic"
        />
      </div>

      {/* Terrain */}
      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Terrain</div>
        <select
          style={selectStyle()}
          value={terrain}
          onChange={e => setTerrain(e.target.value)}
        >
          {TERRAIN_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Advanced section — collapsible */}
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={() => setShowAdvanced(prev => !prev)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            background: theme.bg.surface,
            border: `1px solid ${theme.border.muted}`,
            borderRadius: theme.radius.sm,
            cursor: 'pointer',
            color: theme.text.secondary,
            fontSize: theme.font.sizeSm,
            fontFamily: theme.font.family,
            fontWeight: 500,
            transition: theme.transition.fast,
          }}
        >
          Advanced
          <ChevronDownIcon
            size={14}
            style={{
              transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: theme.transition.fast,
            }}
          />
        </button>

        {showAdvanced && (
          <div style={{
            ...cardStyle(),
            marginTop: 6,
          }}>
            {/* History File */}
            <div style={fieldRowStyle}>
              <div style={themeLabelStyle()}>History File</div>
              <select
                style={selectStyle()}
                value={selectedHistoryFile}
                onChange={e => setSelectedHistoryFile(e.target.value)}
              >
                <option value="">Create new file</option>
                {historyFiles.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs, marginTop: 2 }}>
                {selectedHistoryFile
                  ? `Province entry will be appended to ${selectedHistoryFile}`
                  : 'A new file will be created for this province'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={creating || !canSubmit}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: canSubmit ? theme.accent.green : theme.bg.surface,
          color: canSubmit ? '#fff' : theme.text.muted,
          border: `1px solid ${canSubmit ? theme.accent.green : theme.border.default}`,
          borderRadius: theme.radius.sm,
          cursor: canSubmit ? 'pointer' : 'default',
          fontSize: theme.font.sizeLg,
          fontFamily: theme.font.family,
          fontWeight: 600,
          transition: theme.transition.fast,
        }}
      >
        {creating ? 'Creating...' : isEditing ? 'Update Province' : 'Create Province'}
      </button>

      {isEditing && onCancelEdit && (
        <button
          onClick={onCancelEdit}
          style={{
            width: '100%',
            padding: '6px 12px',
            marginTop: 6,
            background: 'transparent',
            color: theme.text.muted,
            border: `1px solid ${theme.border.default}`,
            borderRadius: theme.radius.sm,
            cursor: 'pointer',
            fontSize: theme.font.sizeMd,
            fontFamily: theme.font.family,
            fontWeight: 500,
            transition: theme.transition.fast,
          }}
        >
          Cancel Edit
        </button>
      )}

      {lastCreated && (
        <div style={{ color: theme.accent.green, fontSize: theme.font.sizeSm, marginTop: 6 }}>
          {lastCreated}
        </div>
      )}

      {/* Info */}
      <div style={dividerStyle()} />
      <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs }}>
        {isEditing
          ? 'Updates the pending province details. Files are written on save.'
          : 'Provinces are auto-registered when you paint with a new color. Use this form to fill in details or create a province before painting.'}
      </div>
    </div>
  );
}
