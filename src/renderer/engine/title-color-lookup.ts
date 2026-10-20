import type { RGB } from '@shared/types';

/** R8 256³ lookup: the shader indexes by exact RGB, without scanning the map. */
export function titleColorLookup(colors: RGB[]): Uint8Array {
  const lookup = new Uint8Array(256 ** 3);
  for (const { r, g, b } of colors) lookup[r + g * 256 + b * 65536] = 255;
  return lookup;
}
