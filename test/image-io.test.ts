import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PNG } from 'pngjs';
import { loadPng, savePng } from '../src/main/image-io';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmp-image-io-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('province PNG compatibility', () => {
  it('loads 16-bit grayscale heightmaps as 8-bit RGBA', async () => {
    const filePath = path.join(tmpDir, 'heightmap.png');
    const samples = new Uint16Array([0, 32896, 65535]);
    const encoded = PNG.sync.write({ width: 3, height: 1, data: Buffer.from(samples.buffer) }, {
      colorType: 0, inputColorType: 0, bitDepth: 16, inputHasAlpha: false,
    });
    await fs.writeFile(filePath, encoded);
    const image = await loadPng(filePath);
    expect([image.width, image.height]).toEqual([3, 1]);
    expect(new Uint8Array(image.buffer)).toEqual(new Uint8Array([
      0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
    ]));
  });

  it('preserves exact province RGB values through repeated worker load/save cycles', async () => {
    const pixels = new Uint8Array([
      0, 0, 0, 255, 255, 255, 255, 255, 1, 2, 3, 255,
      254, 128, 7, 255, 17, 201, 93, 255, 255, 0, 128, 255,
    ]);
    let current = pixels;

    for (let cycle = 0; cycle < 2; cycle++) {
      const filePath = path.join(tmpDir, `round-trip-${cycle}.png`);
      await savePng(filePath, current, 3, 2);
      const loaded = await loadPng(filePath);

      expect([loaded.width, loaded.height]).toEqual([3, 2]);
      expect(new Uint8Array(loaded.buffer)).toEqual(pixels);
      current = loaded.buffer;
    }
  });

  it('writes 24-bit RGB without blending colors with the input alpha channel', async () => {
    const filePath = path.join(tmpDir, 'rgb.png');
    await savePng(filePath, new Uint8Array([
      12, 34, 56, 0, 201, 123, 45, 128,
    ]), 2, 1);

    const encoded = await fs.readFile(filePath);
    // PNG IHDR: byte 24 is bit depth, byte 25 is color type (2 = RGB).
    expect(encoded[24]).toBe(8);
    expect(encoded[25]).toBe(2);
    const { buffer } = await loadPng(filePath);
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([
      12, 34, 56, 255, 201, 123, 45, 255,
    ]));
  });
});
