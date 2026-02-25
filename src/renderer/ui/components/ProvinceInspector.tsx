/**
 * ProvinceInspector — Province data viewer and editor.
 *
 * On province click:
 * - Shows province ID, name, color
 * - Loads history data (culture, religion, holding, terrain)
 * - Date dropdown to browse between existing date-stamped override entries
 * - Resolves and displays the de jure hierarchy upward (barony -> county -> duchy -> kingdom -> empire)
 * - Hierarchy titles are editable inline (rename title keys)
 * - Culture and religion are county-scoped, shown at county level
 * - All fields are editable inline
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ProvinceData, LandedTitleNode, ProvinceDateEntry, RGB } from '@shared/types';
import { theme, inputStyle as themeInputStyle, labelStyle as themeLabelStyle, sectionHeading, cardStyle, selectStyle, dividerStyle } from '../theme';

const TIER_LABELS: Record<string, string> = {
  b: 'Barony',
  c: 'County',
  d: 'Duchy',
  k: 'Kingdom',
  e: 'Empire',
};

const TIER_ORDER = ['b', 'c', 'd', 'k', 'e'];

const TIER_COLORS: Record<string, string> = {
  b: theme.text.secondary,
  c: theme.accent.blue,
  d: theme.accent.purple,
  k: theme.accent.yellow,
  e: theme.accent.red,
};

/** All valid CK3 terrain types (from common/province_terrain/) */
const TERRAIN_TYPES = [
  'plains', 'farmlands', 'hills', 'mountains', 'desert', 'desert_mountains',
  'oasis', 'forest', 'taiga', 'taiga_bog', 'jungle', 'wetlands', 'steppe',
  'floodplains', 'drylands', 'cloudforest', 'highlands',
  'the_bog', 'frozen_flats', 'glacier', 'urban',
  'sea', 'coastal_sea',
  'majorroad_plains', 'majorroad_farmlands', 'majorroad_hills',
  'majorroad_mountains', 'majorroad_forest', 'majorroad_taiga',
  'majorroad_taiga_bog', 'majorroad_steppe', 'majorroad_wetlands',
  'majorroad_highlands', 'majorroad_the_bog',
  'minorroad_plains', 'minorroad_farmlands', 'minorroad_hills',
  'minorroad_mountains', 'minorroad_desert', 'minorroad_desert_mountains',
  'minorroad_forest', 'minorroad_taiga', 'minorroad_jungle',
  'minorroad_wetlands', 'minorroad_steppe', 'minorroad_floodplains',
  'minorroad_drylands', 'minorroad_cloudforest', 'minorroad_highlands',
];

interface ProvinceInspectorProps {
  /** Currently selected province (from clicking the map) */
  province: ProvinceData | null;
  /** Pixel color at cursor */
  pixelColor: RGB | null;
  /** Callback to fetch hierarchy from main process */
  onFetchHierarchy: (provinceId: number) => Promise<LandedTitleNode[]>;
  /** Callback when province data is edited */
  onProvinceEdit: (province: ProvinceData) => void;
  /** Callback when a hierarchy title key is renamed */
  onTitleRename: (oldKey: string, newKey: string) => void;
  /** Callback to save all changes */
  onSave: () => void;
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Whether a mod is loaded */
  modLoaded: boolean;
}

const fieldRowStyle: React.CSSProperties = {
  marginBottom: 8,
};

export default function ProvinceInspector({
  province,
  pixelColor,
  onFetchHierarchy,
  onProvinceEdit,
  onTitleRename,
  onSave,
  isDirty,
  modLoaded,
}: ProvinceInspectorProps) {
  const [hierarchy, setHierarchy] = useState<LandedTitleNode[]>([]);
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('base');
  // Track which hierarchy tier is being edited (null = none)
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // Fetch hierarchy when province changes
  useEffect(() => {
    if (!province || !modLoaded) {
      setHierarchy([]);
      return;
    }

    let cancelled = false;
    setLoadingHierarchy(true);

    onFetchHierarchy(province.id).then(chain => {
      if (!cancelled) {
        setHierarchy(chain);
        setLoadingHierarchy(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setHierarchy([]);
        setLoadingHierarchy(false);
      }
    });

    return () => { cancelled = true; };
  }, [province?.id, modLoaded, onFetchHierarchy]);

  // Reset date selection when province changes
  useEffect(() => {
    setSelectedDate('base');
    setEditingTier(null);
  }, [province?.id]);

  const handleFieldChange = useCallback((field: keyof ProvinceData, value: string) => {
    if (!province) return;
    onProvinceEdit({ ...province, [field]: value });
  }, [province, onProvinceEdit]);

  // Get the effective field values based on selected date
  const getEffectiveValues = useCallback((): {
    culture: string;
    religion: string;
    holding: string;
    terrain: string;
  } => {
    if (!province) return { culture: '', religion: '', holding: '', terrain: '' };

    // Start with base values
    const result = {
      culture: province.culture || '',
      religion: province.religion || '',
      holding: province.holding || '',
      terrain: province.terrain || '',
    };

    if (selectedDate === 'base' || !province.dateEntries) return result;

    // Apply date overrides up to and including the selected date
    const sorted = [...province.dateEntries].sort((a, b) => {
      return compareDates(a.date, b.date);
    });

    for (const entry of sorted) {
      if (compareDates(entry.date, selectedDate) > 0) break;
      if (entry.overrides.culture) result.culture = entry.overrides.culture;
      if (entry.overrides.religion) result.religion = entry.overrides.religion;
      if (entry.overrides.holding) result.holding = entry.overrides.holding;
      if (entry.overrides.terrain) result.terrain = entry.overrides.terrain;
    }

    return result;
  }, [province, selectedDate]);

  const handleTitleEditStart = useCallback((tier: string, currentKey: string) => {
    setEditingTier(tier);
    setEditingValue(currentKey);
  }, []);

  const handleTitleEditCommit = useCallback(() => {
    if (!editingTier) return;
    const title = hierarchy.find(t => t.tier === editingTier);
    if (title && editingValue && editingValue !== title.key) {
      onTitleRename(title.key, editingValue);
      setHierarchy(prev => prev.map(t =>
        t.tier === editingTier ? { ...t, key: editingValue } : t
      ));
    }
    setEditingTier(null);
    setEditingValue('');
  }, [editingTier, editingValue, hierarchy, onTitleRename]);

  const handleTitleEditCancel = useCallback(() => {
    setEditingTier(null);
    setEditingValue('');
  }, []);

  if (!modLoaded) {
    return (
      <div>
        <h3 style={sectionHeading()}>Province Inspector</h3>
        <p style={{ color: theme.text.muted, fontSize: theme.font.sizeMd }}>Load a mod to inspect provinces</p>
      </div>
    );
  }

  if (!province) {
    return (
      <div>
        <h3 style={sectionHeading()}>Province Inspector</h3>
        {pixelColor ? (
          <div style={{ fontSize: theme.font.sizeMd }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{
                width: 16, height: 16, borderRadius: theme.radius.sm,
                border: `1px solid ${theme.border.default}`,
                background: `rgb(${pixelColor.r},${pixelColor.g},${pixelColor.b})`,
              }} />
              <span style={{ color: theme.text.secondary, fontFamily: theme.font.mono }}>
                ({pixelColor.r}, {pixelColor.g}, {pixelColor.b})
              </span>
            </div>
            <div style={{ color: theme.text.muted }}>
              {pixelColor.r === 0 && pixelColor.g === 0 && pixelColor.b === 0
                ? 'Unassigned (ocean)'
                : 'No province data — click a province to inspect'}
            </div>
          </div>
        ) : (
          <p style={{ color: theme.text.muted, fontSize: theme.font.sizeMd }}>Click a province on the map to inspect</p>
        )}
      </div>
    );
  }

  const dateEntries = province.dateEntries || [];
  const effective = getEffectiveValues();
  const isDateView = selectedDate !== 'base';

  return (
    <div>
      {/* Province header card */}
      <div style={{
        ...cardStyle(),
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: theme.space.lg,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: theme.radius.sm,
          border: `2px solid ${theme.border.default}`,
          background: `rgb(${province.color.r},${province.color.g},${province.color.b})`,
          flexShrink: 0,
        }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: theme.text.primary, fontSize: theme.font.sizeXl, fontWeight: 600, letterSpacing: '-0.2px' }}>
            {province.name}
          </div>
          <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs, fontFamily: theme.font.mono }}>
            ID: {province.id} &nbsp; RGB: ({province.color.r}, {province.color.g}, {province.color.b})
          </div>
        </div>
      </div>

      {/* Editable fields */}
      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Province Name</div>
        <input
          style={themeInputStyle()}
          value={province.name}
          onChange={e => handleFieldChange('name', e.target.value)}
        />
      </div>

      {/* Date entry selector */}
      {dateEntries.length > 0 && (
        <div style={fieldRowStyle}>
          <div style={themeLabelStyle()}>History Date</div>
          <select
            style={selectStyle()}
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          >
            <option value="base">Base (no date)</option>
            {dateEntries.map(entry => (
              <option key={entry.date} value={entry.date}>{entry.date}</option>
            ))}
          </select>
          {isDateView && (
            <div style={{ color: theme.accent.yellow, fontSize: theme.font.sizeXs, marginTop: 2 }}>
              Viewing values as of {selectedDate} (read-only overlay)
            </div>
          )}
        </div>
      )}

      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Culture (county-scoped)</div>
        <input
          style={{
            ...themeInputStyle(),
            ...(isDateView && effective.culture !== (province.culture || '')
              ? { borderColor: theme.accent.yellow, color: theme.accent.yellow }
              : {}),
          }}
          value={isDateView ? effective.culture : (province.culture || '')}
          onChange={e => handleFieldChange('culture', e.target.value)}
          placeholder="e.g. french"
          readOnly={isDateView}
        />
      </div>

      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Religion (county-scoped)</div>
        <input
          style={{
            ...themeInputStyle(),
            ...(isDateView && effective.religion !== (province.religion || '')
              ? { borderColor: theme.accent.yellow, color: theme.accent.yellow }
              : {}),
          }}
          value={isDateView ? effective.religion : (province.religion || '')}
          onChange={e => handleFieldChange('religion', e.target.value)}
          placeholder="e.g. catholic"
          readOnly={isDateView}
        />
      </div>

      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Holding</div>
        <select
          style={{
            ...selectStyle(),
            ...(isDateView && effective.holding !== (province.holding || '')
              ? { borderColor: theme.accent.yellow, color: theme.accent.yellow }
              : {}),
          }}
          value={isDateView ? effective.holding : (province.holding || '')}
          onChange={e => handleFieldChange('holding', e.target.value)}
          disabled={isDateView}
        >
          <option value="">—</option>
          <option value="castle_holding">Castle</option>
          <option value="city_holding">City</option>
          <option value="church_holding">Church</option>
          <option value="tribal_holding">Tribal</option>
          <option value="none">None</option>
        </select>
      </div>

      <div style={fieldRowStyle}>
        <div style={themeLabelStyle()}>Terrain</div>
        <select
          style={{
            ...selectStyle(),
            ...(isDateView && effective.terrain !== (province.terrain || '')
              ? { borderColor: theme.accent.yellow, color: theme.accent.yellow }
              : {}),
          }}
          value={isDateView ? effective.terrain : (province.terrain || '')}
          onChange={e => handleFieldChange('terrain', e.target.value)}
          disabled={isDateView}
        >
          <option value="">—</option>
          {TERRAIN_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Date entry details — show overridden keys for selected date */}
      {isDateView && (() => {
        const entry = dateEntries.find(e => e.date === selectedDate);
        if (!entry) return null;
        const overrideKeys = Object.keys(entry.overrides).filter(
          k => !['culture', 'religion', 'holding', 'terrain'].includes(k)
        );
        const blockKeys = entry.rawBlocks ? Object.keys(entry.rawBlocks) : [];
        if (overrideKeys.length === 0 && blockKeys.length === 0) return null;

        return (
          <div style={{ marginBottom: 8 }}>
            <div style={themeLabelStyle()}>Other overrides at {selectedDate}</div>
            <div style={{
              background: theme.bg.base, borderRadius: theme.radius.sm, padding: '4px 8px',
              fontFamily: theme.font.mono, fontSize: theme.font.sizeSm, color: theme.accent.yellow,
              border: `1px solid ${theme.border.muted}`,
            }}>
              {overrideKeys.map(k => (
                <div key={k}>{k} = {entry.overrides[k]}</div>
              ))}
              {blockKeys.map(k => (
                <div key={k}>{k} = {'{ ... }'}</div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* De Jure Hierarchy */}
      <div style={dividerStyle()} />
      <h4 style={{ color: theme.text.primary, margin: '0 0 8px', fontSize: theme.font.sizeLg, fontWeight: 600 }}>
        De Jure Hierarchy
      </h4>

      {loadingHierarchy ? (
        <div style={{ color: theme.text.muted, fontSize: theme.font.sizeMd }}>Loading hierarchy...</div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 12, fontSize: theme.font.sizeMd }}>
          {/* Vertical connecting line */}
          <div style={{
            position: 'absolute',
            left: 5,
            top: 8,
            bottom: 8,
            width: 1,
            background: theme.border.default,
          }} />

          {TIER_ORDER.map(tier => {
            const title = hierarchy.find(t => t.tier === tier);
            const isEditing = editingTier === tier;
            const dotColor = title ? (TIER_COLORS[tier] || theme.accent.blue) : theme.border.default;
            return (
              <div key={tier} style={{
                position: 'relative',
                marginBottom: 4,
                padding: '4px 8px 4px 14px',
              }}>
                {/* Node dot */}
                <div style={{
                  position: 'absolute',
                  left: -9,
                  top: 10,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: dotColor,
                  border: `2px solid ${theme.bg.panel}`,
                  boxSizing: 'border-box',
                }} />
                <div style={{
                  color: theme.text.muted,
                  fontSize: theme.font.sizeXs,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  {TIER_LABELS[tier]}
                </div>
                {title ? (
                  isEditing ? (
                    <input
                      style={{
                        ...themeInputStyle(),
                        fontFamily: theme.font.mono,
                        fontSize: theme.font.sizeMd,
                        padding: '1px 4px',
                      }}
                      value={editingValue}
                      onChange={e => setEditingValue(e.target.value)}
                      onBlur={handleTitleEditCommit}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleTitleEditCommit();
                        if (e.key === 'Escape') handleTitleEditCancel();
                      }}
                      autoFocus
                    />
                  ) : (
                    <div
                      style={{
                        color: theme.text.primary, fontFamily: theme.font.mono, fontSize: theme.font.sizeMd,
                        cursor: 'text', padding: '1px 0',
                      }}
                      onDoubleClick={() => handleTitleEditStart(tier, title.key)}
                      title="Double-click to rename"
                    >
                      {title.key}
                    </div>
                  )
                ) : (
                  <div style={{ color: theme.text.muted, fontFamily: theme.font.mono, fontSize: theme.font.sizeMd }}>
                    —
                  </div>
                )}
                {tier === 'c' && title && (
                  <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs, marginTop: 1 }}>
                    Culture/Religion scope
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* History file info */}
      {province.historyFile && (
        <>
          <div style={dividerStyle()} />
          <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs, fontFamily: theme.font.mono }}>
            History: {province.historyFile}
          </div>
        </>
      )}

      {/* Save button */}
      <div style={dividerStyle()} />
      <button
        onClick={onSave}
        disabled={!isDirty}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: isDirty ? theme.accent.blueStrong : theme.bg.surface,
          color: isDirty ? '#fff' : theme.text.muted,
          border: `1px solid ${isDirty ? theme.accent.blue : theme.border.default}`,
          borderRadius: theme.radius.sm,
          cursor: isDirty ? 'pointer' : 'default',
          fontSize: theme.font.sizeLg,
          fontFamily: theme.font.family,
          fontWeight: 600,
          transition: theme.transition.fast,
          boxShadow: isDirty ? `0 0 12px ${theme.accent.blueMuted}` : 'none',
        }}
      >
        {isDirty ? 'Save Changes' : 'No Changes'}
      </button>
    </div>
  );
}

/** Compare two CK3 date strings (e.g. "7824.1.1" vs "8000.5.15") */
function compareDates(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
