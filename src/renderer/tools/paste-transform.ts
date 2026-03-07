/**
 * Nearest-neighbor resize and rotate for paste buffers.
 * All transforms preserve exact RGB values (no interpolation blending).
 */

export interface TransformedBuffer {
  pixels: Uint8ClampedArray;
  mask: Uint8Array;
  width: number;
  height: number;
}

/** Nearest-neighbor resize. */
export function resizeBuffer(
  srcPixels: Uint8ClampedArray,
  srcMask: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): TransformedBuffer {
  const pixels = new Uint8ClampedArray(dstW * dstH * 4);
  const mask = new Uint8Array(dstW * dstH);

  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const sy = Math.floor(dy * yRatio);
    for (let dx = 0; dx < dstW; dx++) {
      const sx = Math.floor(dx * xRatio);
      const si = sy * srcW + sx;
      const di = dy * dstW + dx;

      mask[di] = srcMask[si];
      const s4 = si * 4;
      const d4 = di * 4;
      pixels[d4] = srcPixels[s4];
      pixels[d4 + 1] = srcPixels[s4 + 1];
      pixels[d4 + 2] = srcPixels[s4 + 2];
      pixels[d4 + 3] = srcPixels[s4 + 3];
    }
  }

  return { pixels, mask, width: dstW, height: dstH };
}

/**
 * Nearest-neighbor rotate by arbitrary angle (degrees).
 * Returns a new buffer sized to the rotated bounding box.
 */
export function rotateBuffer(
  srcPixels: Uint8ClampedArray,
  srcMask: Uint8Array,
  srcW: number,
  srcH: number,
  angleDeg: number,
): TransformedBuffer {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Source center
  const cx = srcW / 2;
  const cy = srcH / 2;

  // Rotate corners to find destination bounding box
  const corners = [
    [-cx, -cy], [cx, -cy], [cx, cy], [-cx, cy],
  ];

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const [x, y] of corners) {
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }

  const dstW = Math.ceil(maxX - minX);
  const dstH = Math.ceil(maxY - minY);
  const dstCx = dstW / 2;
  const dstCy = dstH / 2;

  const pixels = new Uint8ClampedArray(dstW * dstH * 4);
  const mask = new Uint8Array(dstW * dstH);

  // Inverse rotation for sampling
  const cosInv = Math.cos(-rad);
  const sinInv = Math.sin(-rad);

  for (let dy = 0; dy < dstH; dy++) {
    const oy = dy - dstCy;
    for (let dx = 0; dx < dstW; dx++) {
      const ox = dx - dstCx;

      // Inverse rotate to source coords
      const sx = Math.round(ox * cosInv - oy * sinInv + cx);
      const sy = Math.round(ox * sinInv + oy * cosInv + cy);

      if (sx < 0 || sx >= srcW || sy < 0 || sy >= srcH) continue;

      const si = sy * srcW + sx;
      const di = dy * dstW + dx;

      mask[di] = srcMask[si];
      const s4 = si * 4;
      const d4 = di * 4;
      pixels[d4] = srcPixels[s4];
      pixels[d4 + 1] = srcPixels[s4 + 1];
      pixels[d4 + 2] = srcPixels[s4 + 2];
      pixels[d4 + 3] = srcPixels[s4 + 3];
    }
  }

  return { pixels, mask, width: dstW, height: dstH };
}

/**
 * Apply scale + rotation to a clipboard buffer.
 * Returns the original data unchanged if both are identity.
 */
export function transformBuffer(
  srcPixels: Uint8ClampedArray,
  srcMask: Uint8Array,
  srcW: number,
  srcH: number,
  scale: number,
  angleDeg: number,
): TransformedBuffer {
  const isIdentity = scale === 1 && angleDeg === 0;
  if (isIdentity) {
    return { pixels: srcPixels, mask: srcMask, width: srcW, height: srcH };
  }

  let result: TransformedBuffer;

  // Scale first, then rotate
  if (scale !== 1) {
    const newW = Math.max(1, Math.round(srcW * scale));
    const newH = Math.max(1, Math.round(srcH * scale));
    result = resizeBuffer(srcPixels, srcMask, srcW, srcH, newW, newH);
  } else {
    result = { pixels: srcPixels, mask: srcMask, width: srcW, height: srcH };
  }

  if (angleDeg !== 0) {
    result = rotateBuffer(result.pixels, result.mask, result.width, result.height, angleDeg);
  }

  return result;
}
