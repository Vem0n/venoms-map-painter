/** Release tooling uses Node built-ins and the runner's GitHub CLI only. */
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

function normalizeVersion(input) {
  const version = String(input).replace(/^v/, '');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version);
  if (!match || version.length > 100 || match[4]?.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    throw new Error(`Invalid release version: ${input}`);
  }
  return { version, prerelease: !!match[4] };
}

function changelogSection(changelog, version, strict = true) {
  const sections = Array.from(changelog.replace(/\r\n/g, '\n').matchAll(/^## (.+)$/gm));
  const exact = sections.findIndex(section => section[1].split(/\s/)[0].replace(/^v/, '') === version);
  const unreleased = sections.findIndex(section => /^Unreleased(?:\s|$)/i.test(section[1]));
  const index = strict ? exact : unreleased >= 0 ? unreleased : exact;
  if (index < 0) throw new Error(`CHANGELOG.md needs a nonempty "## v${version}" section before tagging this release.`);
  const section = sections[index];
  const body = changelog.replace(/\r\n/g, '\n').slice(section.index + section[0].length, sections[index + 1]?.index).trim();
  if (!body) throw new Error('The release changelog section is empty.');
  return body;
}

function assetNames(version) {
  const stem = `venoms-map-painter-${normalizeVersion(version).version}`;
  return {
    windows: [`${stem}-windows-x64-setup.exe`, `${stem}-windows-x64-portable.exe`, `${stem}-windows-x64.zip`],
    linux: [`${stem}-linux-x86_64.AppImage`, `${stem}-linux-amd64.deb`, `${stem}-linux-x86_64.rpm`],
  };
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function requireFile(file) {
  const info = await fs.stat(file);
  if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty release asset: ${file}`);
}
async function checksums(directory, names) {
  const rows = [];
  for (const name of [...names].sort()) {
    await requireFile(path.join(directory, name));
    rows.push({ name, sha256: await sha256(path.join(directory, name)) });
  }
  return rows;
}
function checksumText(rows) { return rows.map(row => `${row.sha256}  ${row.name}\n`).join(''); }

async function metadata() {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const { version, prerelease } = normalizeVersion(pkg.version);
  const isTag = process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF_TYPE === 'tag';
  const tag = `v${version}`;
  if (isTag && process.env.GITHUB_REF_NAME !== tag) throw new Error(`Tag ${process.env.GITHUB_REF_NAME} does not match package.json (${tag}).`);
  const changelog = changelogSection(await fs.readFile('CHANGELOG.md', 'utf8'), version, isTag);
  const repository = process.env.GITHUB_REPOSITORY || 'Vem0n/venoms-map-painter';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository name.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const data = { version, tag, prerelease, repository, commit, changelog, isTag };
  await fs.mkdir('release', { recursive: true });
  await fs.writeFile('release/metadata.json', JSON.stringify(data, null, 2) + '\n');
  console.log(`Validated ${tag}, source ${commit}${isTag ? ' (tagged release)' : ' (build artifacts only)'}`);
  return data;
}
async function readMetadata() { return JSON.parse(await fs.readFile('release/metadata.json', 'utf8')); }

async function stage(platform) {
  const data = await readMetadata();
  const names = assetNames(data.version)[platform];
  if (!names) throw new Error(`Unknown platform: ${platform}`);
  const output = 'release/upload';
  await fs.mkdir(output, { recursive: true });
  const binaries = platform === 'windows' ? names.slice(0, 2) : names;
  for (const name of binaries) {
    await requireFile(path.join('release', name));
    await fs.copyFile(path.join('release', name), path.join(output, name));
  }
  if (platform === 'windows') {
    const bundle = 'release/windows-bundle';
    await fs.mkdir(bundle, { recursive: true });
    for (const name of binaries) await fs.copyFile(path.join(output, name), path.join(bundle, name));
    for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) await fs.copyFile(name, path.join(bundle, name));
    await fs.writeFile(path.join(bundle, 'SHA256SUMS.txt'), checksumText(await checksums(output, binaries)));
    await fs.writeFile(path.join(bundle, 'README-WINDOWS.txt'),
      `Ven0m's Map Painter ${data.version}\n\nChoose one:\n- ${binaries[0]}: install the app.\n- ${binaries[1]}: run without installing.\n\n` +
      `The app edits the mod folder you choose. Drafts and backups remain under that mod.\n\nSource and support: https://github.com/${data.repository}\n`);
  }
}

function releaseNotes(data, rows, reports) {
  const reportByName = new Map(reports.map(report => [report.name, report]));
  const lines = [`# Changelog\n\n${data.changelog}`, `## Downloads\n\nAll builds are x64. The Windows ZIP contains both the installer and portable EXE.`,
  ];
  const table = ['| File | SHA-256 | VirusTotal |', '| --- | --- | --- |'];
  for (const row of rows) {
    const report = reportByName.get(row.name);
    if (row.name.endsWith('.exe')) {
      if (!report || report.sha256 !== row.sha256 || report.status !== 'completed' ||
          !Number.isInteger(report.stats?.malicious) || !Number.isInteger(report.stats?.suspicious)) {
        throw new Error(`Missing completed VirusTotal report matching the exact bytes of ${row.name}`);
      }
    }
    const scan = report ? `[Report](https://www.virustotal.com/gui/file/${row.sha256}) — ${report.stats.malicious} malicious, ${report.stats.suspicious} suspicious` : '—';
    table.push(`| [${row.name}](https://github.com/${data.repository}/releases/download/${data.tag}/${row.name}) | \`${row.sha256}\` | ${scan} |`);
  }
  lines.push(table.join('\n'), `\n## Verification\n\nDownload \`SHA256SUMS.txt\` to verify the files. VirusTotal results above are for the two Windows EXEs; review the linked live reports for current details.`,
    `Source commit: [\`${data.commit}\`](https://github.com/${data.repository}/commit/${data.commit})`,
    `\n<!-- vmp-release-source:${data.commit} -->`);
  return lines.join('\n\n') + '\n';
}

async function notes() {
  const data = await readMetadata();
  const names = Object.values(assetNames(data.version)).flat();
  const rows = await checksums('release/assets', names);
  const reports = JSON.parse(await fs.readFile('release/virustotal.json', 'utf8'));
  await fs.writeFile('release/assets/SHA256SUMS.txt', checksumText(rows));
  await fs.writeFile('release/RELEASE_NOTES.md', releaseNotes(data, rows, reports));
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `Prepared ${data.tag}: ${rows.length} packages, SHA-256 manifest and completed Windows VirusTotal reports.\n`);
}

function validateExistingRelease(existing, commit) {
  if (!existing.isDraft) throw new Error('This release is already published. Refusing to replace published files; use a new version/tag.');
  if (!existing.body?.includes(`<!-- vmp-release-source:${commit} -->`)) throw new Error('An unrelated draft exists for this tag. Refusing to overwrite it.');
}
async function publish(gh = args => execFileSync('gh', args, { encoding: 'utf8' })) {
  const data = await readMetadata();
  if (!data.isTag) throw new Error('Only version-tag pushes can create a release.');
  const args = ['--repo', data.repository];
  let existing;
  try { existing = JSON.parse(gh(['release', 'view', data.tag, ...args, '--json', 'isDraft,body'])); }
  catch (error) {
    // Only an absent release may be created; authentication/network failures must surface.
    if (!String(error.stderr || error.message).match(/release not found|HTTP 404|Not Found/i)) throw error;
  }
  const names = [...Object.values(assetNames(data.version)).flat(), 'SHA256SUMS.txt'];
  for (const name of names) await requireFile(path.join('release/assets', name));
  const files = names.map(name => path.join('release/assets', name));
  if (existing) {
    validateExistingRelease(existing, data.commit);
    gh(['release', 'upload', data.tag, ...args, ...files, '--clobber']);
    gh(['release', 'edit', data.tag, ...args, '--notes-file', 'release/RELEASE_NOTES.md']);
  } else {
    gh(['release', 'create', data.tag, ...args, ...files, '--verify-tag', '--draft', '--title', data.tag,
      '--notes-file', 'release/RELEASE_NOTES.md', ...(data.prerelease ? ['--prerelease'] : [])]);
  }
  const url = `https://github.com/${data.repository}/releases/tag/${data.tag}`;
  console.log(`Draft release ready for review: ${url}`);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `\n[Open draft release](${url}). Review its notes/assets and publish it from GitHub when ready.\n`);
}

async function main() {
  const [command, platform] = process.argv.slice(2);
  if (command === 'metadata') await metadata();
  else if (command === 'stage') await stage(platform);
  else if (command === 'checksums') {
    const data = await readMetadata();
    const names = assetNames(data.version)[platform];
    if (!names) throw new Error('Choose windows or linux.');
    await fs.writeFile(`release/upload/SHA256SUMS-${platform}.txt`, checksumText(await checksums('release/upload', names)));
  } else if (command === 'notes') await notes();
  else if (command === 'publish') await publish();
  else throw new Error('Usage: node scripts/release.cjs metadata|stage PLATFORM|checksums PLATFORM|notes|publish');
}
module.exports = { normalizeVersion, changelogSection, assetNames, sha256, checksums, checksumText, releaseNotes, validateExistingRelease };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
