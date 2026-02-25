/**
 * ProvinceSearch — Sidebar component for searching provinces by ID or name.
 *
 * Shows a dropdown of matching results as the user types (debounced 150ms).
 * Clicking a result jumps the camera to that province's location on the map.
 * Uses binary search prefix matching in ColorRegistry for efficient search
 * across 8000+ provinces.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProvinceData } from '@shared/types';
import type { ColorRegistry } from '@registry/color-registry';
import { theme, sectionHeading, inputStyle } from '../theme';
import { SearchIcon } from './icons';

interface ProvinceSearchProps {
  registry: ColorRegistry | null;
  onJumpToProvince: (province: ProvinceData) => void;
}

export default function ProvinceSearch({ registry, onJumpToProvince }: ProvinceSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProvinceData[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Click-outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim().length === 0) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      if (registry) {
        const found = registry.searchProvinces(val, 15);
        setResults(found);
        setHoveredIndex(-1);
        setIsOpen(found.length > 0);
      }
    }, 150);
  }, [registry]);

  const handleResultClick = useCallback((province: ProvinceData) => {
    onJumpToProvince(province);
    setQuery(`${province.id} - ${province.name}`);
    setIsOpen(false);
  }, [onJumpToProvince]);

  const handleFocus = useCallback(() => {
    setFocused(true);
    if (results.length > 0 && query.trim().length > 0) {
      setIsOpen(true);
    }
  }, [results, query]);

  return (
    <div ref={containerRef} style={{ position: 'relative', marginBottom: 4 }}>
      <h3 style={sectionHeading()}>Province Search</h3>

      {/* Input with search icon */}
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          color: theme.text.muted,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
        }}>
          <SearchIcon size={12} />
        </div>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={() => setFocused(false)}
          placeholder="Search by ID or name..."
          style={{
            ...inputStyle(focused),
            paddingLeft: 26,
          }}
        />
      </div>

      {isOpen && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: theme.bg.elevated,
          border: `1px solid ${theme.border.default}`,
          borderTop: 'none',
          borderRadius: `0 0 ${theme.radius.sm}px ${theme.radius.sm}px`,
          maxHeight: 300,
          overflowY: 'auto',
          zIndex: 100,
          boxShadow: theme.shadow.dropdown,
        }}>
          {results.map((p, index) => (
            <div
              key={p.id}
              onClick={() => handleResultClick(p)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(-1)}
              style={{
                padding: '6px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: theme.font.sizeMd,
                color: theme.text.primary,
                background: hoveredIndex === index ? theme.bg.hover : 'transparent',
                borderBottom: `1px solid ${theme.border.muted}`,
                transition: theme.transition.fast,
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: 2,
                border: `1px solid ${theme.border.default}`,
                background: `rgb(${p.color.r},${p.color.g},${p.color.b})`,
                flexShrink: 0,
              }} />
              <span style={{ color: theme.text.muted, fontFamily: theme.font.mono, minWidth: 40, fontSize: theme.font.sizeSm }}>
                #{p.id}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
