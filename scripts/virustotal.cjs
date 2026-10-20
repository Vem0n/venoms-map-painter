/** Upload the exact Windows release EXEs and wait for completed VirusTotal reports. */
const fs = require('node:fs/promises');
const { openAsBlob } = require('node:fs');
const path = require('node:path');
const { assetNames, sha256 } = require('./release.cjs');
const API = 'https://www.virustotal.com/api/v3';
const sleepDefault = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function validStats(stats) {
  return ['malicious', 'suspicious'].every(key => Number.isInteger(stats?.[key]) && stats[key] >= 0);
}
function uploadUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || (url.hostname !== 'virustotal.com' && !url.hostname.endsWith('.virustotal.com')) || url.username || url.password) {
    throw new Error('VirusTotal returned an unexpected upload URL.');
  }
  return url.href;
}
function createClient({ apiKey, fetchImpl = fetch, sleep = sleepDefault, now = Date.now, intervalMs = 16000 }) {
  if (!apiKey) throw new Error('Add the VIRUSTOTAL_API_KEY repository Actions secret, then rerun the failed release job. Build artifacts remain available.');
  let lastRequest = -Infinity;
  return async (url, options = {}) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const wait = Math.max(0, intervalMs - (now() - lastRequest));
      if (wait) await sleep(wait);
      lastRequest = now();
      let response;
      try {
        response = await fetchImpl(url, { ...options, redirect: 'error', headers: { ...options.headers, 'x-apikey': apiKey }, signal: AbortSignal.timeout(120000) });
      } catch {
        if (attempt === 4) throw new Error('VirusTotal could not be reached after five attempts. Rerun the failed release job.');
        await sleep(Math.min(60000, 2000 * 2 ** attempt));
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 4) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(120000, retryAfter * 1000) : 60000);
        continue;
      }
      return response;
    }
  };
}
async function readResponse(response) {
  if (!response.ok) throw new Error(`VirusTotal API returned HTTP ${response.status}. Check the API key/quota and rerun the failed release job.`);
  return response.json();
}
async function scanFile(file, { request, sleep = sleepDefault, now = Date.now, pollMs = 20000, timeoutMs = 20 * 60 * 1000 }) {
  const info = await fs.stat(file);
  if (!info.isFile() || !info.size) throw new Error(`Missing or empty Windows binary: ${path.basename(file)}`);
  if (info.size > 650000000) throw new Error('Windows binary exceeds the VirusTotal 650 MB upload limit.');
  const hash = await sha256(file);
  const name = path.basename(file);
  const result = (stats, date, source) => ({ name, sha256: hash, status: 'completed', stats, date, source, url: `https://www.virustotal.com/gui/file/${hash}` });
  const known = await request(`${API}/files/${hash}`);
  if (known.ok) {
    const report = await known.json();
    if (report.data?.id !== hash) throw new Error('VirusTotal returned a different file hash.');
    if (report.data.attributes?.last_analysis_date && validStats(report.data.attributes.last_analysis_stats)) {
      return result(report.data.attributes.last_analysis_stats, report.data.attributes.last_analysis_date, 'existing report');
    }
  } else if (known.status !== 404) {
    await readResponse(known);
  }

  let endpoint = `${API}/files`;
  if (info.size >= 32000000) {
    endpoint = uploadUrl((await readResponse(await request(`${API}/files/upload_url`))).data);
  }
  const form = new FormData();
  form.set('file', await openAsBlob(file), name);
  const uploaded = await readResponse(await request(endpoint, { method: 'POST', body: form }));
  const analysisId = uploaded.data?.id;
  if (typeof analysisId !== 'string' || !analysisId) throw new Error('VirusTotal upload did not return an analysis ID.');
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    await sleep(pollMs);
    const analysis = await readResponse(await request(`${API}/analyses/${encodeURIComponent(analysisId)}`));
    const remoteHash = analysis.meta?.file_info?.sha256;
    if (remoteHash && remoteHash !== hash) throw new Error('VirusTotal analysis does not match the uploaded file hash.');
    if (analysis.data?.attributes?.status === 'completed') {
      const { stats, date } = analysis.data.attributes;
      if (!validStats(stats)) throw new Error('VirusTotal completed without usable detection counts.');
      return result(stats, date, 'uploaded by this workflow');
    }
  }
  throw new Error(`VirusTotal analysis for ${name} is still pending after 20 minutes. Rerun the failed release job; completed reports are reused by exact SHA-256.`);
}
async function main() {
  const request = createClient({ apiKey: process.env.VIRUSTOTAL_API_KEY });
  const metadata = JSON.parse(await fs.readFile('release/metadata.json', 'utf8'));
  const reports = [];
  for (const name of assetNames(metadata.version).windows.filter(name => name.endsWith('.exe'))) {
    console.log(`Checking VirusTotal for ${name}...`);
    const report = await scanFile(path.join('release/assets', name), { request });
    reports.push(report);
    console.log(`${name}: completed — ${report.stats.malicious} malicious, ${report.stats.suspicious} suspicious. ${report.url}`);
  }
  await fs.writeFile('release/virustotal.json', JSON.stringify(reports, null, 2) + '\n');
}
module.exports = { validStats, uploadUrl, createClient, scanFile };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
