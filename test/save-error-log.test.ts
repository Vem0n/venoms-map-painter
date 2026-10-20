import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { writeSaveErrorLog } from '../src/main/save-error-log';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'vmp-save-log-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

const context = { operation: 'save-mod', target: '/mod/test', message: 'Disk write failed', stack: 'Error: Disk write failed\n    at originalMainProcessFrame (disk.ts:123)' };

describe('save failure logs', () => {
  it('persists the operation, target and original stack outside the mod directory', async () => {
    const directory = path.join(root, 'profile/logs');
    const report = await writeSaveErrorLog(context, { directory, appVersion: 'test-version' });
    expect(report.logPath).toBeTruthy();
    expect(path.dirname(report.logPath!)).toBe(directory);
    const contents = await fs.readFile(report.logPath!, 'utf8');
    expect(contents).toContain(context.stack);
    expect(contents).toContain('Operation: save-mod');
    expect(contents).toContain('Target: /mod/test');
    expect(contents).toContain('App version: test-version');
    if (process.platform !== 'win32') expect((await fs.stat(report.logPath!)).mode & 0o777).toBe(0o600);
    expect(await fs.readdir(root)).toEqual(['profile']);
  });

  it('falls back to another directory when the normal log location cannot be written', async () => {
    const blocked = path.join(root, 'blocked');
    await fs.writeFile(blocked, 'not a directory');
    const fallbackDirectory = path.join(root, 'fallback');
    const report = await writeSaveErrorLog(context, { directory: path.join(blocked, 'logs'), fallbackDirectory, appVersion: 'test' });
    expect(path.dirname(report.logPath!)).toBe(fallbackDirectory);
    expect(await fs.readFile(report.logPath!, 'utf8')).toContain(context.stack);
  });

  it('returns the original error and log failure details if neither location works', async () => {
    const blocked = path.join(root, 'blocked');
    await fs.writeFile(blocked, 'not a directory');
    const report = await writeSaveErrorLog(context, {
      directory: path.join(blocked, 'primary'), fallbackDirectory: path.join(blocked, 'fallback'), appVersion: 'test',
    });
    expect(report.message).toBe(context.message);
    expect(report.logPath).toBeNull();
    expect(report.logError).toContain('primary');
    expect(report.logError).toContain('fallback');
  });

  it('keeps distinct logs for concurrent failures', async () => {
    const options = { directory: path.join(root, 'logs'), appVersion: 'test' };
    const reports = await Promise.all([writeSaveErrorLog(context, options), writeSaveErrorLog({ ...context, message: 'Second failure', stack: 'Second stack' }, options)]);
    expect(new Set(reports.map(report => report.logPath)).size).toBe(2);
    expect(await fs.readFile(reports[0].logPath!, 'utf8')).toContain(context.stack);
    expect(await fs.readFile(reports[1].logPath!, 'utf8')).toContain('Second stack');
  });
});
