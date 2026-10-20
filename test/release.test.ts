import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const release = require('../scripts/release.cjs');
const vt = require('../scripts/virustotal.cjs');

async function withFile(run: (file: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'vmp-release-test-'));
  const file = path.join(directory, 'test.exe');
  try { await writeFile(file, 'abc'); await run(file); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const stats = { malicious: 1, suspicious: 2, undetected: 70 };

describe('release metadata and integrity', () => {
  it('normalizes version prefixes and classifies prereleases correctly', () => {
    expect(release.normalizeVersion('v2.2.0-beta.1')).toEqual({ version: '2.2.0-beta.1', prerelease: true });
    expect(release.normalizeVersion('2.2.0+build-one')).toEqual({ version: '2.2.0+build-one', prerelease: false });
  });
  it.each(['2.02.0', '2.2', 'v2.2.0-beta.01', '2.2.0; exit 0', '../2.2.0', '2.2.0\n'])('rejects malformed/unsafe versions: %s', version => {
    expect(() => release.normalizeVersion(version)).toThrow('Invalid release version');
  });
  it('extracts the tagged changelog only, with CRLF support and no historical spill', () => {
    const changelog = '# Changelog\r\n\r\n## Unreleased — Next\r\n\r\nfuture\r\n\r\n## v2.2.0 — New\r\n\r\nthis release\r\n\r\n## v2.1.0\r\n\r\nold\r\n';
    expect(release.changelogSection(changelog, '2.2.0')).toBe('this release');
    expect(release.changelogSection(changelog, '2.2.0', false)).toBe('future');
    expect(() => release.changelogSection(changelog, '2.3.0')).toThrow('CHANGELOG.md');
    expect(() => release.changelogSection('## v2.2.0\n\n## v2.1.0\nold', '2.2.0')).toThrow('empty');
  });
  it('stages distinct Windows targets and the native Linux architecture filenames', () => {
    const names = release.assetNames('2.2.0-beta.1');
    expect(new Set(Object.values(names).flat()).size).toBe(6);
    expect(names.linux).toEqual(['venoms-map-painter-2.2.0-beta.1-linux-x86_64.AppImage', 'venoms-map-painter-2.2.0-beta.1-linux-amd64.deb', 'venoms-map-painter-2.2.0-beta.1-linux-x86_64.rpm']);
    expect(names.windows[0]).toContain('-setup.exe'); expect(names.windows[1]).toContain('-portable.exe');
  });
  it('hashes exact file bytes and produces a standard SHA-256 manifest', async () => {
    await withFile(async file => {
      expect(await release.sha256(file)).toBe(hash);
      const rows = await release.checksums(path.dirname(file), [path.basename(file)]);
      expect(release.checksumText(rows)).toBe(`${hash}  test.exe\n`);
      await writeFile(file, 'changed');
      expect(await release.sha256(file)).not.toBe(hash);
    });
  });
  it('requires completed scan reports matching the final binaries, and reports detections honestly', () => {
    const data = { version: '2.2.0', tag: 'v2.2.0', commit: 'a'.repeat(40), repository: 'Vem0n/venoms-map-painter', changelog: '- New feature' };
    const rows = Object.values(release.assetNames(data.version)).flat().map(name => ({ name, sha256: hash }));
    const reports = rows.filter(row => row.name.endsWith('.exe')).map(row => ({ ...row, status: 'completed', stats }));
    const notes = release.releaseNotes(data, rows, reports);
    expect(notes).toContain('1 malicious, 2 suspicious');
    expect(notes).toContain('| File | SHA-256 | VirusTotal |\n| --- | --- | --- |\n|');
    expect(notes).toContain(`vmp-release-source:${data.commit}`);
    expect(() => release.releaseNotes(data, rows, [])).toThrow('Missing completed');
    expect(() => release.releaseNotes(data, rows, reports.map(report => ({ ...report, sha256: 'b'.repeat(64) })))).toThrow('exact bytes');
    expect(() => release.releaseNotes(data, rows, reports.map(report => ({ ...report, status: 'queued' })))).toThrow('Missing completed');
  });
  it('allows retries of its own draft while refusing published and unrelated releases', () => {
    expect(() => release.validateExistingRelease({ isDraft: false, body: '' }, 'abc')).toThrow('already published');
    expect(() => release.validateExistingRelease({ isDraft: true, body: 'user notes' }, 'abc')).toThrow('unrelated draft');
    expect(() => release.validateExistingRelease({ isDraft: true, body: '<!-- vmp-release-source:abc -->' }, 'abc')).not.toThrow();
  });
});

describe('VirusTotal release scans (mocked API; no real uploads)', () => {
  it('requires the configured secret and rejects external/insecure upload endpoints', () => {
    expect(() => vt.createClient({ apiKey: '' })).toThrow('VIRUSTOTAL_API_KEY');
    expect(vt.uploadUrl('https://www.virustotal.com/_ah/upload/123')).toContain('virustotal.com');
    for (const url of ['http://www.virustotal.com/upload', 'https://evil.test/upload', 'https://virustotal.com.evil.test/upload', 'https://user:pass@www.virustotal.com/upload']) expect(() => vt.uploadUrl(url)).toThrow();
  });
  it('retries rate limits without logging or exposing the API key', async () => {
    const delays: number[] = [];
    let calls = 0;
    const request = vt.createClient({ apiKey: 'test-only', intervalMs: 0, sleep: async (ms: number) => { delays.push(ms); }, fetchImpl: async (_url: string, options: RequestInit) => {
      expect(options.headers).toEqual({ 'x-apikey': 'test-only' });
      expect(options.redirect).toBe('error');
      return ++calls === 1 ? json({}, 429, { 'retry-after': '1' }) : json({ ok: true });
    } });
    expect((await request('https://www.virustotal.com/api/v3/files/test')).ok).toBe(true);
    expect(calls).toBe(2); expect(delays).toEqual([1000]);
  });
  it('reuses a completed report only for the same exact SHA-256', async () => {
    await withFile(async file => {
      let calls = 0;
      const report = await vt.scanFile(file, { request: async (url: string) => {
        calls++; expect(url).toContain(hash);
        return json({ data: { id: hash, attributes: { last_analysis_date: 123, last_analysis_stats: stats } } });
      } });
      expect(calls).toBe(1); expect(report.status).toBe('completed'); expect(report.sha256).toBe(hash); expect(report.stats).toEqual(stats);
    });
  });
  it('uploads new bytes and waits through a queued analysis instead of claiming an immediate clean result', async () => {
    await withFile(async file => {
      let calls = 0, elapsed = 0;
      const report = await vt.scanFile(file, { now: () => elapsed, sleep: async (ms: number) => { elapsed += ms; }, pollMs: 1, request: async (_url: string, options: RequestInit = {}) => {
        calls++;
        if (calls === 1) return json({}, 404);
        if (calls === 2) { expect(options.method).toBe('POST'); expect((options.body as FormData).get('file')).toBeInstanceOf(Blob); return json({ data: { id: 'scan-1' } }); }
        return json({ data: { attributes: { status: calls === 3 ? 'queued' : 'completed', stats, date: 123 } }, meta: { file_info: { sha256: hash } } });
      } });
      expect(calls).toBe(4); expect(report.status).toBe('completed'); expect(report.stats.malicious).toBe(1);
    });
  });
  it('uses the large-file endpoint before multipart overhead can exceed the 32 MB limit', async () => {
    await withFile(async file => {
      const handle = await open(file, 'r+'); await handle.truncate(32 * 1024 * 1024); await handle.close();
      const urls: string[] = [];
      const report = await vt.scanFile(file, { sleep: async () => {}, request: async (url: string) => {
        urls.push(url);
        if (urls.length === 1) return json({}, 404);
        if (urls.length === 2) return json({ data: 'https://www.virustotal.com/_ah/upload/large' });
        if (urls.length === 3) return json({ data: { id: 'large-scan' } });
        return json({ data: { attributes: { status: 'completed', stats, date: 123 } } });
      } });
      expect(urls[1]).toContain('/files/upload_url'); expect(urls[2]).toContain('/_ah/upload/large'); expect(report.status).toBe('completed');
    });
  });
  it('fails on API authorization errors and pending analyses instead of inventing scan counts', async () => {
    await withFile(async file => {
      await expect(vt.scanFile(file, { request: async () => json({}, 401) })).rejects.toThrow('HTTP 401');
      let elapsed = 0, calls = 0;
      await expect(vt.scanFile(file, { now: () => elapsed, sleep: async (ms: number) => { elapsed += ms; }, pollMs: 1, timeoutMs: 3, request: async () => {
        calls++; if (calls === 1) return json({}, 404); if (calls === 2) return json({ data: { id: 'pending' } });
        return json({ data: { attributes: { status: 'queued' } } });
      } })).rejects.toThrow('still pending');
    });
  });
});
