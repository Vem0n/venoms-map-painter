import type { RGB } from './types';

export interface HSV { h: number; s: number; v: number }

/** Hue is measured in turns; saturation, value and lightness are in [0, 1]. */
export function rgbToHsv(color: RGB, fallbackHue = 0): HSV {
  const r = color.r / 255, g = color.g / 255, b = color.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = fallbackHue;
  if (delta) {
    if (max === r) h = ((g - b) / delta + 6) % 6 / 6;
    else if (max === g) h = ((b - r) / delta + 2) / 6;
    else h = ((r - g) / delta + 4) / 6;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const channel = (offset: number) => {
    const k = (offset + h * 6) % 6;
    return Math.round(255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return { r: channel(5), g: channel(3), b: channel(1) };
}

export function rgbToHsl(color: RGB): { h: number; s: number; l: number } {
  const { h } = rgbToHsv(color);
  const max = Math.max(color.r, color.g, color.b) / 255;
  const min = Math.min(color.r, color.g, color.b) / 255;
  const l = (max + min) / 2;
  const delta = max - min;
  return { h, s: delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1)), l };
}

export function rgbToHex(color: RGB): string {
  return '#' + [color.r, color.g, color.b].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function hexToRgb(value: string): RGB | null {
  const hex = value.trim().replace(/^#/, '');
  if (!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}
