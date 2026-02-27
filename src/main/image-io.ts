/**
 * Image I/O — Load and save PNG files using sharp.
 *
 * Runs in the main process. Returns raw RGBA buffers for the renderer.
 * sharp handles the heavy lifting of PNG decode/encode natively.
 *
 * PNG decoding runs in a short-lived Worker thread so that all sharp/libvips
 * native memory is freed when the worker terminates. The decoded RGBA data is
 * passed through a temp file so the main thread's V8 heap never holds the
 * ~134MB buffer — fs.readFile returns an externally-allocated Buffer that
 * doesn't inflate the V8 heap high-water mark.
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Worker } from 'worker_threads';

// Disable sharp's cache for save operations that still run on the main thread.
sharp.cache(false);
sharp.concurrency(1);

interface LoadResult {
  /** Raw RGBA pixel data */
  buffer: Uint8Array;
  width: number;
  height: number;
}

/**
 * Load a PNG file and return its raw RGBA buffer.
 *
 * Runs sharp in a Worker thread to isolate native memory. The worker writes
 * decoded RGBA to a temp file and posts back only the metadata. The main
 * thread reads the temp file with fs.readFile (external allocation, not V8
 * heap) and cleans up. Result: main process stays at ~33MB after load.
 */
export async function loadPng(filePath: string): Promise<LoadResult> {
  const tmpFile = path.join(
    os.tmpdir(),
    `map-painter-${Date.now()}-${Math.random().toString(36).slice(2)}.raw`,
  );

  // Resolve sharp's path from the main process so the worker doesn't rely on
  // CWD-based module resolution (which breaks when the packaged app is run
  // from a different directory than where it's installed).
  const sharpPath = require.resolve('sharp');

  const meta = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const sharp = require(${JSON.stringify(sharpPath)});
      const fs = require('fs');
      sharp.cache(false);
      sharp.concurrency(1);
      (async () => {
        try {
          const { data, info } = await sharp(workerData.filePath)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          if (!info.width || !info.height) {
            throw new Error('Could not read image dimensions');
          }
          fs.writeFileSync(workerData.tmpFile, data);
          parentPort.postMessage({ width: info.width, height: info.height });
        } catch (err) {
          parentPort.postMessage({ error: err.message || String(err) });
        }
      })();
    `;

    const worker = new Worker(workerCode, {
      eval: true,
      workerData: { filePath, tmpFile },
    });

    worker.on('message', (msg: { width?: number; height?: number; error?: string }) => {
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve({ width: msg.width!, height: msg.height! });
      }
    });

    worker.on('error', reject);

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Image loader worker exited with code ${code}`));
      }
    });
  });

  // Worker has exited — all sharp/libvips native memory is freed.
  // Read the temp file. fs.readFile returns a Buffer backed by external
  // (C++ allocated) memory that doesn't count toward V8's heap limit
  // and is properly freed when dereferenced.
  try {
    const buffer = await fs.readFile(tmpFile);
    return { buffer, width: meta.width, height: meta.height };
  } finally {
    // Clean up temp file (fire and forget)
    fs.unlink(tmpFile).catch(() => {});
  }
}

/**
 * Save a raw RGBA buffer as a PNG file.
 * Backup is handled by the caller (VMP-Backups/).
 */
export async function savePng(
  filePath: string,
  rgbaBuffer: Uint8Array,
  width: number,
  height: number,
): Promise<void> {
  // CK3 requires 24-bit RGB PNG (no alpha). Saving as RGBA (32-bit) causes CTD.
  // Strip the alpha channel before encoding.
  await sharp(Buffer.from(rgbaBuffer), {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .removeAlpha()
    .png({ compressionLevel: 6 })
    .toFile(filePath);
}
