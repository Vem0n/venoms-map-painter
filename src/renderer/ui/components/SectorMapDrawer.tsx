/**
 * SectorMapDrawer — Collapsible bottom drawer for debugging the SectorManager
 * spatial index. Shows sector stats and lets you search by province ID to see
 * which sectors contain it.
 */

import { useState, useMemo } from 'react';
import { SectorManager } from '@registry/sector-manager';
import { rgbToKey } from '@shared/types';
import { theme, inputStyle } from '../theme';
import { SearchIcon, ChevronDownIcon, GridIcon } from './icons';
import type { RegistryRef } from '../hooks/types';

interface SectorMapDrawerProps {
  registryRef: RegistryRef;
}

export default function SectorMapDrawer({ registryRef }: SectorMapDrawerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const registry = registryRef.current;
  const sm = registry.getSectorManager();
  const { sectorsX, sectorsY } = sm.gridSize;

  const searchResult = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const id = parseInt(trimmed, 10);
    if (isNaN(id) || String(id) !== trimmed) return null;

    const province = registry.getProvinceById(id);
    if (!province) return { notFound: true as const, id };

    const colorKey = rgbToKey(province.color);
    const sectors = sm.getSectorsForColor(colorKey);
    const coords = Array.from(sectors)
      .map(key => SectorManager.sectorCoordsFromKey(key, sectorsX))
      .sort((a, b) => a.gsy - b.gsy || a.gsx - b.gsx);

    return {
      notFound: false as const,
      province,
      colorKey,
      sectorCount: sectors.size,
      coords,
    };
  }, [query, registry, sm, sectorsX]);

  return (
    <div style={drawerContainerStyle}>
      {/* Handle bar — always visible */}
      <button
        onClick={() => setOpen(prev => !prev)}
        style={handleStyle}
      >
        <GridIcon size={14} color={theme.text.muted} />
        <span style={handleLabelStyle}>Sector Map</span>
        <ChevronDownIcon
          size={14}
          color={theme.text.muted}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s ease',
          }}
        />
      </button>

      {/* Content panel */}
      <div style={{
        maxHeight: open ? 280 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.25s ease',
      }}>
        <div style={contentStyle}>
          {/* Stats row */}
          <div style={statsRowStyle}>
            <span>
              Grid: {sectorsX} x {sectorsY} = {sectorsX * sectorsY}
            </span>
            <span style={{ color: sm.isPopulated ? theme.accent.green : theme.text.muted }}>
              {sm.isPopulated ? 'Populated' : 'Not populated'}
            </span>
            <span>Colors: {sm.colorCount}</span>
          </div>

          {/* Search bar */}
          <div style={searchRowStyle}>
            <SearchIcon size={14} color={theme.text.muted} style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }} />
            <input
              type="text"
              placeholder="Search province ID..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                ...inputStyle(),
                paddingLeft: 28,
                fontSize: theme.font.sizeSm,
              }}
            />
          </div>

          {/* Results area */}
          <div style={resultsAreaStyle}>
            {!searchResult && (
              <div style={emptyStateStyle}>
                Enter a province ID to see its sector locations
              </div>
            )}

            {searchResult && searchResult.notFound && (
              <div style={emptyStateStyle}>
                No province with ID {searchResult.id}
              </div>
            )}

            {searchResult && !searchResult.notFound && (
              <>
                {/* Province info row */}
                <div style={provinceInfoStyle}>
                  <div style={{
                    width: 14,
                    height: 14,
                    borderRadius: theme.radius.sm,
                    border: `1px solid ${theme.border.default}`,
                    background: `rgb(${searchResult.province.color.r},${searchResult.province.color.g},${searchResult.province.color.b})`,
                    flexShrink: 0,
                  }} />
                  <span style={{ color: theme.text.primary, fontWeight: 500 }}>
                    #{searchResult.province.id}
                  </span>
                  <span style={{ color: theme.text.secondary }}>
                    {searchResult.province.name}
                  </span>
                  <span style={{
                    marginLeft: 'auto',
                    color: theme.accent.blue,
                    fontFamily: theme.font.mono,
                    fontSize: theme.font.sizeSm,
                  }}>
                    {searchResult.sectorCount} sector{searchResult.sectorCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Sector coordinate list */}
                <div style={sectorListStyle}>
                  {searchResult.coords.map(({ gsx, gsy }) => (
                    <span key={`${gsx},${gsy}`} style={sectorChipStyle}>
                      ({gsx}, {gsy})
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────── */

const drawerContainerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
};

const handleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 28,
  padding: '0 12px',
  background: theme.bg.panel,
  borderTop: `1px solid ${theme.border.default}`,
  border: 'none',
  borderTopWidth: 1,
  borderTopStyle: 'solid',
  borderTopColor: theme.border.default,
  cursor: 'pointer',
  flexShrink: 0,
};

const handleLabelStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: theme.font.sizeSm,
  fontFamily: theme.font.family,
  fontWeight: 500,
  letterSpacing: '0.3px',
  textTransform: 'uppercase',
  flex: 1,
  textAlign: 'left',
};

const contentStyle: React.CSSProperties = {
  background: theme.bg.base,
  borderTop: `1px solid ${theme.border.muted}`,
  padding: theme.space.md,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space.md,
};

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: theme.space.xl,
  fontFamily: theme.font.mono,
  fontSize: theme.font.sizeSm,
  color: theme.text.muted,
};

const searchRowStyle: React.CSSProperties = {
  position: 'relative',
};

const resultsAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  maxHeight: 180,
};

const emptyStateStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: theme.font.sizeSm,
  fontFamily: theme.font.family,
  padding: `${theme.space.lg}px 0`,
  textAlign: 'center',
};

const provinceInfoStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: theme.font.sizeMd,
  fontFamily: theme.font.family,
  padding: `${theme.space.sm}px 0`,
  borderBottom: `1px solid ${theme.border.muted}`,
  marginBottom: theme.space.md,
};

const sectorListStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.sm,
};

const sectorChipStyle: React.CSSProperties = {
  fontFamily: theme.font.mono,
  fontSize: theme.font.sizeSm,
  color: theme.text.secondary,
  background: theme.bg.surface,
  border: `1px solid ${theme.border.muted}`,
  borderRadius: theme.radius.sm,
  padding: `2px 6px`,
};
