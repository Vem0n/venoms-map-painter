import { describe, expect, it } from 'vitest';
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsl, rgbToHsv } from '@shared/colors';

describe('picker colors', () => {
  it('accepts six-digit hex and shorthand, rejecting partial or invalid values', () => {
    expect(hexToRgb('#12AbEF')).toEqual({ r: 18, g: 171, b: 239 });
    expect(hexToRgb('abc')).toEqual({ r: 170, g: 187, b: 204 });
    for (const input of ['#', '12', '#12345', '#gggggg', '12345678']) expect(hexToRgb(input)).toBeNull();
    expect(rgbToHex({ r: 0, g: 15, b: 255 })).toBe('#000FFF');
  });

  it('preserves exact RGB through the visual picker, including black, gray and white', () => {
    for (const r of [0, 1, 32, 128, 254, 255]) {
      for (const g of [0, 1, 32, 128, 254, 255]) {
        for (const b of [0, 1, 32, 128, 254, 255]) {
          const rgb = { r, g, b };
          expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb);
        }
      }
    }
  });

  it('keeps a chosen hue available when the visual picker moves through gray', () => {
    expect(rgbToHsv({ r: 128, g: 128, b: 128 }, 0.6).h).toBe(0.6);
    expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 2 / 3, s: 1, l: 0.5 });
  });
});
