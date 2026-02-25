/**
 * ColorPicker — Sidebar component for selecting paint colors.
 *
 * Features:
 * - Current color display with RGB swatch
 * - Manual RGB input fields
 * - "Suggest Next" button for guaranteed-unique colors
 * - Non-blocking warning when a selected color is already in the registry
 * - Palette generator: pick a base hue, generate related unique colors
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { RGB } from '@shared/types';
import type { ColorRegistry } from '@registry/color-registry';
import { theme, sectionHeading, cardStyle } from '../theme';

/** Extract hue (0-360) from an RGB color */
function rgbToHue(color: RGB): number {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return 0;

  let hue: number;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  return hue;
}

interface ColorPickerProps {
  color: RGB;
  onChange: (color: RGB) => void;
  registry: ColorRegistry | null;
}

const rgbInputStyle: React.CSSProperties = {
  width: 48,
  background: theme.bg.base,
  color: theme.text.primary,
  border: `1px solid ${theme.border.default}`,
  borderRadius: theme.radius.sm,
  padding: '2px 4px',
  fontSize: theme.font.sizeMd,
  fontFamily: theme.font.mono,
  textAlign: 'center',
};

const btnStyle: React.CSSProperties = {
  background: theme.bg.surface,
  color: theme.text.secondary,
  border: `1px solid ${theme.border.default}`,
  borderRadius: theme.radius.sm,
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: theme.font.sizeMd,
  fontFamily: theme.font.family,
  fontWeight: 500,
  transition: theme.transition.fast,
  width: '100%',
};

export default function ColorPicker({ color, onChange, registry }: ColorPickerProps) {
  const [paletteHue, setPaletteHue] = useState(0);
  const [paletteColors, setPaletteColors] = useState<RGB[]>([]);
  const [hoverSwatch, setHoverSwatch] = useState<number | null>(null);

  // Sync palette hue slider with the currently active color
  useEffect(() => {
    setPaletteHue(rgbToHue(color));
  }, [color]);

  const rgbString = `rgb(${color.r}, ${color.g}, ${color.b})`;

  // Check if current color is already registered
  const isUsed = registry?.isColorUsed(color) ?? false;
  const ownerProvince = isUsed ? registry?.getProvinceByColor(color) : undefined;

  const handleComponentChange = useCallback((component: 'r' | 'g' | 'b', value: string) => {
    const num = Math.max(0, Math.min(255, parseInt(value, 10) || 0));
    onChange({ ...color, [component]: num });
  }, [color, onChange]);

  const handleSuggest = useCallback(() => {
    if (!registry) return;
    const suggested = registry.suggestNextColor();
    onChange(suggested);
  }, [registry, onChange]);

  const handleGeneratePalette = useCallback(() => {
    if (!registry) return;
    const hue01 = paletteHue / 360;
    const colors = registry.generatePalette(hue01, 12);
    setPaletteColors(colors);
  }, [registry, paletteHue]);

  const handlePaletteColorClick = useCallback((c: RGB) => {
    onChange(c);
  }, [onChange]);

  return (
    <div>
      <h3 style={sectionHeading()}>Paint Color</h3>

      {/* Color swatch + RGB values */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: theme.radius.md,
          border: `2px solid ${theme.border.default}`,
          background: rgbString,
          flexShrink: 0,
        }} />
        <div style={{ display: 'flex', gap: 4, fontSize: theme.font.sizeSm }}>
          <label style={{ color: theme.text.secondary }}>
            R<br />
            <input
              type="number"
              min={0} max={255}
              value={color.r}
              onChange={(e) => handleComponentChange('r', e.target.value)}
              style={rgbInputStyle}
            />
          </label>
          <label style={{ color: theme.text.secondary }}>
            G<br />
            <input
              type="number"
              min={0} max={255}
              value={color.g}
              onChange={(e) => handleComponentChange('g', e.target.value)}
              style={rgbInputStyle}
            />
          </label>
          <label style={{ color: theme.text.secondary }}>
            B<br />
            <input
              type="number"
              min={0} max={255}
              value={color.b}
              onChange={(e) => handleComponentChange('b', e.target.value)}
              style={rgbInputStyle}
            />
          </label>
        </div>
      </div>

      {/* Warning for used colors */}
      {isUsed && ownerProvince && (
        <div style={{
          background: 'rgba(210,153,34,0.1)',
          border: `1px solid rgba(210,153,34,0.3)`,
          borderRadius: theme.radius.sm,
          padding: '4px 8px',
          fontSize: theme.font.sizeSm,
          color: theme.accent.yellow,
          marginBottom: 8,
        }}>
          Province {ownerProvince.id}: {ownerProvince.name} — painting will expand this province
        </div>
      )}

      {/* Suggest next unique color */}
      <button onClick={handleSuggest} style={{ ...btnStyle, marginBottom: theme.space.lg }}>
        Suggest Unique Color
      </button>

      {/* Palette generator */}
      <div style={{ ...cardStyle(), marginTop: 4 }}>
        <h3 style={{ ...sectionHeading(), fontSize: theme.font.sizeLg }}>Realm Palette</h3>
        <p style={{ color: theme.text.muted, fontSize: theme.font.sizeXs, margin: '0 0 6px' }}>
          Generate related colors for title hierarchies (kingdom/duchy/county).
        </p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <label style={{ color: theme.text.secondary, fontSize: theme.font.sizeSm, flexShrink: 0 }}>Hue:</label>
          <input
            type="range"
            min={0} max={360}
            value={paletteHue}
            onChange={(e) => setPaletteHue(parseInt(e.target.value, 10))}
            style={{ flex: 1 }}
          />
          <span style={{ color: theme.text.secondary, fontSize: theme.font.sizeSm, fontFamily: theme.font.mono, minWidth: 30 }}>
            {paletteHue}
          </span>
        </div>
        {/* Hue preview bar */}
        <div style={{
          height: 12,
          borderRadius: theme.radius.sm,
          marginBottom: 6,
          background: `hsl(${paletteHue}, 70%, 50%)`,
          border: `1px solid ${theme.border.muted}`,
        }} />
        <button onClick={handleGeneratePalette} style={{ ...btnStyle, marginBottom: 8 }}>
          Generate Palette
        </button>

        {/* Palette swatches */}
        {paletteColors.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {paletteColors.map((c, i) => (
              <div
                key={i}
                onClick={() => handlePaletteColorClick(c)}
                onMouseEnter={() => setHoverSwatch(i)}
                onMouseLeave={() => setHoverSwatch(null)}
                title={`${c.r}, ${c.g}, ${c.b}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: theme.radius.sm,
                  border: `1px solid ${theme.border.default}`,
                  background: `rgb(${c.r}, ${c.g}, ${c.b})`,
                  cursor: 'pointer',
                  transform: hoverSwatch === i ? 'scale(1.15)' : 'scale(1)',
                  transition: theme.transition.fast,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
