import React, { useEffect, useRef, useState } from 'react';
import type { RGB } from '@shared/types';
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv, type HSV } from '@shared/colors';
import { inputStyle, theme } from '../theme';

interface Props {
  color: RGB;
  onChange: (color: RGB) => void;
  disabled: boolean;
}

/** Local picker: no native OS dialog or dependency is needed. */
export default function HarmonizeColorPicker({ color, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState(() => rgbToHsv(color));
  const [hex, setHex] = useState(() => rgbToHex(color));
  const [channels, setChannels] = useState(() => ({ r: String(color.r), g: String(color.g), b: String(color.b) }));

  useEffect(() => {
    setHsv(previous => rgbToHsv(color, previous.h));
    setHex(rgbToHex(color));
    setChannels({ r: String(color.r), g: String(color.g), b: String(color.b) });
  }, [color]);

  useEffect(() => {
    if (!open) return;
    squareRef.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const commitHsv = (next: HSV) => {
    setHsv(next);
    onChange(hsvToRgb(next));
  };
  const pickSquare = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const v = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    commitHsv({ ...hsv, s, v });
  };
  const swatch = `rgb(${color.r}, ${color.g}, ${color.b})`;
  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const weakColor = rgbToHex(hsvToRgb({ ...hsv, s: 0 }));
  const strongColor = rgbToHex(hsvToRgb({ ...hsv, s: 1 }));
  const labelStyle: React.CSSProperties = { display: 'grid', gap: 4, color: theme.text.secondary, fontSize: theme.font.sizeSm };
  const close = () => { setOpen(false); buttonRef.current?.focus(); };

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'flex' }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Harmonize base color"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        title={`Harmonize color: ${rgbToHex(color)} — click to choose independently of the paint brush`}
        onClick={() => setOpen(value => !value)}
        style={{ width: 30, height: 30, padding: 0, background: swatch, border: `2px solid ${theme.border.default}`, borderRadius: theme.radius.sm, cursor: disabled ? 'default' : 'pointer' }}
      />
      {open && (
        <div
          role="dialog"
          aria-label="Harmonize color"
          onKeyDown={event => {
            event.stopPropagation();
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') event.preventDefault();
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            if (event.key === 'Tab') {
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input, button, [tabindex="0"]'));
              const first = controls[0], last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
          }}
          onKeyUp={event => event.stopPropagation()}
          style={{ position: 'absolute', bottom: 40, left: 0, width: 280, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', boxSizing: 'border-box', padding: 14, background: theme.bg.surface, border: `1px solid ${theme.border.default}`, borderRadius: theme.radius.md, boxShadow: theme.shadow.dropdown, color: theme.text.primary, fontFamily: theme.font.family }}
        >
          <style>{`
            .vmp-harmonize-range {
              appearance: none; height: 12px; border-radius: 6px; cursor: pointer;
            }
            .vmp-harmonize-range::-webkit-slider-thumb {
              appearance: none; width: 14px; height: 18px; border-radius: 4px;
              background: white; border: 2px solid #30363d; box-shadow: 0 0 2px #000;
            }
          `}</style>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong>Harmonize color</strong>
            <button type="button" aria-label="Close harmonize color picker" onClick={close} style={{ background: 'transparent', border: 0, color: theme.text.primary, cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
          <div
            ref={squareRef}
            role="slider"
            tabIndex={0}
            aria-label="Color saturation and brightness"
            aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.s * 100)}
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              pickSquare(event);
            }}
            onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickSquare(event); }}
            onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
            onKeyDown={event => {
              const step = event.shiftKey ? 0.1 : 0.01;
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault();
                commitHsv({ ...hsv,
                  s: Math.max(0, Math.min(1, hsv.s + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0))),
                  v: Math.max(0, Math.min(1, hsv.v + (event.key === 'ArrowDown' ? -step : event.key === 'ArrowUp' ? step : 0))),
                });
              }
            }}
            style={{ position: 'relative', height: 150, touchAction: 'none', cursor: 'crosshair', background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueColor}`, borderRadius: theme.radius.sm }}
          >
            <span style={{ position: 'absolute', left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, width: 10, height: 10, transform: 'translate(-50%, -50%)', border: '2px solid white', borderRadius: '50%', boxShadow: '0 0 2px 1px black', pointerEvents: 'none' }} />
          </div>
          <label style={{ ...labelStyle, marginTop: 12 }}>
            Hue
            <input className="vmp-harmonize-range" aria-label="Harmonize hue" type="range" min={0} max={360} value={Math.round(hsv.h * 360)} onChange={event => commitHsv({ ...hsv, h: Number(event.target.value) / 360 })} style={{ width: '100%', margin: '4px 0', background: 'linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)', accentColor: hueColor }} />
          </label>
          <label style={{ ...labelStyle, marginTop: 8 }}>
            Color strength (saturation): {Math.round(hsv.s * 100)}%
            <input className="vmp-harmonize-range" aria-label="Harmonize color strength" type="range" min={0} max={100} value={Math.round(hsv.s * 100)} onChange={event => commitHsv({ ...hsv, s: Number(event.target.value) / 100 })} style={{ width: '100%', margin: '4px 0', background: `linear-gradient(to right, ${weakColor}, ${strongColor})` }} />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 10 }}>
            <div aria-label="Selected harmonize color" title={rgbToHex(color)} style={{ width: 36, height: 36, flexShrink: 0, background: swatch, border: `1px solid ${theme.border.default}`, borderRadius: theme.radius.sm }} />
            <label style={{ ...labelStyle, flex: 1 }}>
              Hex
              <input aria-label="Harmonize hex" value={hex} spellCheck={false} maxLength={7} aria-invalid={!hexToRgb(hex)} onChange={event => {
                setHex(event.target.value);
                // Three-digit shorthand is expanded on blur so typing six digits stays natural.
                if (/^#?[a-f\d]{6}$/i.test(event.target.value)) onChange(hexToRgb(event.target.value)!);
              }} onBlur={() => { const parsed = hexToRgb(hex); if (parsed) onChange(parsed); else setHex(rgbToHex(color)); }} style={{ ...inputStyle(), fontFamily: theme.font.mono }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {(['r', 'g', 'b'] as const).map(channel => (
              <label key={channel} style={{ ...labelStyle, flex: 1, minWidth: 0 }}>
                {channel.toUpperCase()}
                <input aria-label={`Harmonize ${channel.toUpperCase()}`} type="number" min={0} max={255} step={1} value={channels[channel]} aria-invalid={channels[channel] === '' || !Number.isInteger(Number(channels[channel])) || Number(channels[channel]) < 0 || Number(channels[channel]) > 255} onChange={event => {
                  const value = event.target.value;
                  setChannels(previous => ({ ...previous, [channel]: value }));
                  const num = Number(value);
                  if (value !== '' && Number.isInteger(num) && num >= 0 && num <= 255) onChange({ ...color, [channel]: num });
                }} onBlur={() => setChannels(previous => ({ ...previous, [channel]: String(color[channel]) }))} style={{ ...inputStyle(), fontFamily: theme.font.mono }} />
              </label>
            ))}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: theme.font.sizeXs, color: theme.text.muted }}>Stronger saturation keeps the same hue. Colors already assigned to provinces are excluded when harmonizing.</p>
        </div>
      )}
    </div>
  );
}
