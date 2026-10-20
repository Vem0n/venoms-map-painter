import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import type { SaveFailureContext, SaveFailureReport } from '@shared/types';

/** Persist diagnostics outside mod folders. Logging failure never hides the save error. */
export async function writeSaveErrorLog(
  context: SaveFailureContext,
  options: { directory: string; fallbackDirectory?: string; appVersion: string },
): Promise<SaveFailureReport> {
  const report: SaveFailureReport = { message: context.message, operation: context.operation, logPath: null };
  const timestamp = new Date().toISOString();
  const filename = `save-error-${timestamp.replace(/[:.]/g, '-')}-${randomUUID()}.log`;
  const contents = [
    "Ven0m's Map Painter — save failure",
    `Time (UTC): ${timestamp}`,
    `App version: ${options.appVersion}`,
    `Platform: ${process.platform} ${process.arch}; OS: ${os.release()}`,
    `Electron: ${process.versions.electron ?? 'not running'}; Node: ${process.versions.node}`,
    `Operation: ${context.operation}`,
    `Target: ${context.target ?? 'unknown'}`,
    '',
    `Message: ${context.message}`,
    context.stack ?? '',
    '',
  ].join('\n');
  const directories = [...new Set([options.directory, options.fallbackDirectory ?? path.join(os.tmpdir(), 'venoms-map-painter-logs')])];
  const failures: string[] = [];
  for (const directory of directories) {
    try {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const logPath = path.join(directory, filename);
      await fs.writeFile(logPath, contents, { flag: 'wx', mode: 0o600 });
      return { ...report, logPath };
    } catch (error) {
      failures.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ...report, logError: failures.join('\n') };
}
