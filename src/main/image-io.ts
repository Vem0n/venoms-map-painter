/**
 * Lossless PNG I/O in short-lived workers.
 * pngjs avoids native image-library conflicts in Electron on Linux. Decoded
 * pixels pass through a temporary file so the main process reads an external
 * Buffer rather than copying a full map into its V8 heap.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Worker } from 'worker_threads';

interface LoadResult {
  buffer: Uint8Array;
  width: number;
  height: number;
}

interface WorkerResult {
  width?: number;
  height?: number;
  error?: string;
}

type WorkerRequest =
  | { operation: 'load'; filePath: string; tmpFile: string }
  | { operation: 'save'; filePath: string; rgbaBuffer: Uint8Array; width: number; height: number };

/** Run PNG processing off the main thread and wait for the worker to release its buffers. */
function processPng(request: WorkerRequest): Promise<WorkerResult> {
  // Resolve in the main process so workers also work from packaged ASAR files
  // and when the application is launched from another working directory.
  const pngPath = require.resolve('pngjs');
  const workerCode = `
    const { parentPort, workerData } = require('worker_threads');
    const { PNG } = require(${JSON.stringify(pngPath)});
    const fs = require('fs');
    try {
      if (workerData.operation === 'load') {
        // Do not apply gamma correction: RGB values identify provinces.
        const image = PNG.sync.read(fs.readFileSync(workerData.filePath));
        fs.writeFileSync(workerData.tmpFile, image.data);
        parentPort.postMessage({ width: image.width, height: image.height });
      } else {
        const { rgbaBuffer, width, height, filePath } = workerData;
        const rgb = Buffer.allocUnsafe(width * height * 3);
        // Drop alpha explicitly instead of compositing against a background.
        // Even transparent input pixels must retain their exact province RGB.
        for (let src = 0, dest = 0; src < rgbaBuffer.length; src += 4) {
          rgb[dest++] = rgbaBuffer[src];
          rgb[dest++] = rgbaBuffer[src + 1];
          rgb[dest++] = rgbaBuffer[src + 2];
        }
        const encoded = PNG.sync.write({ width, height, data: rgb }, {
          colorType: 2,
          inputColorType: 2,
          inputHasAlpha: false,
          bitDepth: 8,
          deflateLevel: 6,
        });
        fs.writeFileSync(filePath, encoded);
        parentPort.postMessage({});
      }
    } catch (error) {
      parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
  `;

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerCode, { eval: true, workerData: request });
    let result: WorkerResult | undefined;
    worker.on('message', (message: WorkerResult) => { result = message; });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`PNG worker exited with code ${code}`));
      } else if (!result) {
        reject(new Error('PNG worker exited without a result'));
      } else if (result.error) {
        reject(new Error(result.error));
      } else {
        resolve(result);
      }
    });
  });
}

/** Decode a PNG into 8-bit RGBA without changing its RGB values or applying gamma correction. */
export async function loadPng(filePath: string): Promise<LoadResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'map-painter-'));
  const tmpFile = path.join(tmpDir, 'pixels.raw');
  try {
    const { width, height } = await processPng({ operation: 'load', filePath, tmpFile });
    if (!width || !height) throw new Error('Could not read image dimensions');
    const buffer = await fs.readFile(tmpFile);
    return { buffer, width, height };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/** Save exact RGB pixels as a 24-bit PNG. The caller handles VMP-Backups/. */
export async function savePng(
  filePath: string,
  rgbaBuffer: Uint8Array,
  width: number,
  height: number,
): Promise<void> {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 || rgbaBuffer.byteLength !== width * height * 4) {
    throw new Error('RGBA buffer does not match the image dimensions');
  }
  await processPng({ operation: 'save', filePath, rgbaBuffer, width, height });
}
