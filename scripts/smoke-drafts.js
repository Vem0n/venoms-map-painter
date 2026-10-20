const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');

async function originalFiles(root) {
  const result = {};
  for (const relative of await fs.readdir(root, { recursive: true })) {
    if (relative.split(path.sep)[0] === 'VMP-Drafts') continue;
    const file = path.join(root, relative);
    if ((await fs.stat(file)).isFile()) result[relative] = (await fs.readFile(file)).toString('hex');
  }
  return result;
}

async function snapshotAll(root) {
  const entries = {};
  for (const relative of await fs.readdir(root, { recursive: true })) {
    const file = path.join(root, relative);
    const stat = await fs.stat(file, { bigint: true });
    entries[relative] = stat.isDirectory() ? { directory: true, modified: String(stat.mtimeNs) }
      : { bytes: (await fs.readFile(file)).toString('hex'), modified: String(stat.mtimeNs) };
  }
  return entries;
}

module.exports = async function smokeDrafts(window, ipcMain, tempDir, writeCalls) {
  const modA = path.join(tempDir, 'draft-mod');
  const modB = path.join(tempDir, 'draft-other');
  const definitions = '0;0;0;0;x;x;\n1;12;34;56;Original province;x;\n2;50;60;70;Orphan two;x;\n3;80;90;100;Orphan three;x;\n';
  for (const modPath of [modA, modB]) {
    const files = {
      'map_data/definition.csv': definitions,
      'history/provinces/original.txt': '1 = {\n culture = original_culture\n}\n',
      'common/landed_titles/original.txt': 'c_original = {\n b_original = { province = 1 }\n}\nc_orphans = {\n b_two = { province = 2 }\n b_three = { province = 3 }\n}\n',
    };
    for (const [relative, contents] of Object.entries(files)) {
      const file = path.join(modPath, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, contents);
    }
    const pixels = Buffer.alloc(32 * 32 * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set([12, 34, 56, 255], i);
    await fs.writeFile(path.join(modPath, 'map_data/provinces.png'), PNG.sync.write({ width: 32, height: 32, data: pixels }));
  }

  const run = (body, arg = null) => window.webContents.executeJavaScript(`(async (arg) => {
    const visible = element => element.getClientRects().length;
    const button = label => Array.from(document.querySelectorAll('button')).filter(visible).find(element => element.textContent.trim() === label);
    const click = label => { const element = button(label); if (!element || element.disabled) throw new Error('Button unavailable: ' + label); element.click(); };
    const waitFor = async (predicate, message) => {
      const end = Date.now() + 5000;
      while (!predicate()) { if (Date.now() >= end) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 20)); }
    };
    const setInput = (input, value) => {
      if (!input) throw new Error('Input missing for ' + value);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const field = label => Array.from(document.querySelectorAll('div')).filter(visible).find(element => element.children.length === 0 && element.textContent.trim() === label)?.parentElement.querySelector('input');
    const pickCenter = () => {
      const canvas = Array.from(document.querySelectorAll('canvas')).find(visible);
      const rect = canvas.getBoundingClientRect();
      const event = { button: 0, bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      canvas.dispatchEvent(new MouseEvent('mousedown', event)); canvas.dispatchEvent(new MouseEvent('mouseup', event));
    };
    const shortcut = shiftKey => document.dispatchEvent(new KeyboardEvent('keydown', { key: shiftKey ? 'S' : 's', ctrlKey: true, shiftKey, bubbles: true }));
    ${body}
  })(${JSON.stringify(arg)})`);

  ipcMain.removeHandler('select-directory');
  ipcMain.handle('select-directory', () => modA);
  await run(`
    const bar = document.querySelector('#root').firstElementChild.firstElementChild;
    Array.from(bar.children).find(element => element.textContent.trim() === '+').click();
    await new Promise(resolve => setTimeout(resolve, 20));
    click('Open Map');
    await waitFor(() => document.body.innerText.includes('Loaded 32x32 map'), 'Draft fixture did not load');
    click('Inspect');
    await new Promise(resolve => setTimeout(resolve, 20));
    pickCenter();
    await waitFor(() => field('Culture (county-scoped)'), 'Inspector did not select province');
    setInput(field('Culture (county-scoped)'), 'draft_culture');
    await new Promise(resolve => setTimeout(resolve, 20));
    setInput(field('Province Name'), 'Edited draft province');
    await new Promise(resolve => setTimeout(resolve, 20));
    const title = Array.from(document.querySelectorAll('[data-hierarchy-title]')).find(element => visible(element) && element.textContent === 'c_original');
    if (!title) throw new Error('County title missing');
    title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    const rename = Array.from(document.querySelectorAll('input')).find(element => visible(element) && element.value === 'c_original');
    setInput(rename, 'c_draft_renamed');
    await new Promise(resolve => setTimeout(resolve, 20));
    rename.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => document.body.innerText.includes('Title rename staged'), 'Rename was not staged');
  `);
  // Loading a normal mod creates a map backup. Editing must not change it or the mod.
  const baseline = await originalFiles(modA);
  assert.match(await fs.readFile(path.join(modA, 'common/landed_titles/original.txt'), 'utf8'), /c_original/);
  assert.match(await fs.readFile(path.join(modA, 'history/provinces/original.txt'), 'utf8'), /original_culture/);

  const beforeDraftDialog = await snapshotAll(modA);
  const callsBeforeDraftDialog = writeCalls.length;
  await run(`
    shortcut(false);
    await waitFor(() => document.querySelector('h2')?.textContent === 'Save Draft', 'Draft naming dialog missing');
  `);
  assert.equal(writeCalls.length, callsBeforeDraftDialog, 'Opening Save Draft invoked a write');
  assert.deepEqual(await snapshotAll(modA), beforeDraftDialog, 'Opening Save Draft changed files or directories');
  await run(`
    click('Cancel');
    await waitFor(() => !document.querySelector('h2'), 'Draft naming dialog did not cancel');
  `);
  assert.equal(writeCalls.length, callsBeforeDraftDialog, 'Cancelling Save Draft invoked a write');
  assert.deepEqual(await snapshotAll(modA), beforeDraftDialog, 'Cancelling Save Draft changed files or directories');

  await run(`
    if (!button('Save Draft').title.includes('Ctrl+S') || !button('Save to Mod').title.includes('Ctrl+Shift+S')) throw new Error('Save shortcut tooltips are incorrect');
    shortcut(false);
    await waitFor(() => Array.from(document.querySelectorAll('h2')).some(h => h.textContent === 'Save Draft'), 'Ctrl+S did not open Save Draft');
    const dialog = Array.from(document.querySelectorAll('h2')).find(h => h.textContent === 'Save Draft').parentElement;
    setInput(dialog.querySelector('input'), 'Isolation draft');
    await new Promise(resolve => setTimeout(resolve, 20));
    dialog.querySelectorAll('button')[1].click();
    await waitFor(() => document.body.innerText.includes('Draft saved: "Isolation draft"'), 'Draft save did not complete');
    const other = await window.mapPainter.loadMod(arg);
    await window.mapPainter.saveDraft(arg, 'Other draft', new Uint8Array([12,34,56,255]), 1, 1, {
      provinces: other.data.provinces, sourceDefinitions: other.data.provinces,
      pendingProvinces: [], pendingSaveOptions: { definitionCsv: true, historyStubs: true, landedTitles: true, terrainEntries: true }, emptyColors: [], lockedColor: null,
    });
  `, modB);
  assert.deepEqual(await originalFiles(modA), baseline, 'Saving draft changed original mod files');
  const draftFolders = await fs.readdir(path.join(modA, 'VMP-Drafts'));
  const metadata = JSON.parse(await fs.readFile(path.join(modA, 'VMP-Drafts', draftFolders[0], 'draft.json'), 'utf8'));
  assert.equal(metadata.provinces[0].culture, 'draft_culture');
  assert.equal(metadata.provinces[0].name, 'Edited draft province');
  assert.deepEqual(metadata.titleRenames, [{ oldKey: 'c_original', newKey: 'c_draft_renamed' }]);
  const beforeB = await originalFiles(modB);

  ipcMain.removeHandler('select-directory');
  ipcMain.handle('select-directory', () => modB);
  await run(`
    click('Load Draft');
    await waitFor(() => document.body.innerText.includes('Other draft'), 'Other mod draft picker did not open');
    click('Cancel');
    await new Promise(resolve => setTimeout(resolve, 20));
    click('Save Draft');
    await waitFor(() => document.querySelector('h2')?.textContent === 'Save Draft', 'Draft save dialog missing after picker cancel');
    const dialog = document.querySelector('h2').parentElement;
    setInput(dialog.querySelector('input'), 'After picker cancel');
    await new Promise(resolve => setTimeout(resolve, 20));
    dialog.querySelectorAll('button')[1].click();
    await waitFor(() => document.body.innerText.includes('Draft saved: "After picker cancel"'), 'Save after picker cancel failed');
  `);
  assert.equal((await fs.readdir(path.join(modA, 'VMP-Drafts'))).length, 2, 'Picker cancel redirected the next draft save');
  assert.equal((await fs.readdir(path.join(modB, 'VMP-Drafts'))).length, 1, 'Picker cancel saved the old map into the other mod');

  await fs.writeFile(path.join(modA, 'map_data/definition.csv'), definitions.replace('12;34;56;Original province', '99;34;56;External province'));
  const driftBaseline = await originalFiles(modA);
  ipcMain.removeHandler('select-directory');
  ipcMain.handle('select-directory', () => modA);
  await run(`
    click('Load Draft');
    await waitFor(() => document.body.innerText.includes('Isolation draft'), 'Draft picker did not list snapshot');
    const name = Array.from(document.querySelectorAll('div')).find(element => visible(element) && element.children.length === 0 && element.textContent === 'Isolation draft');
    name.parentElement.parentElement.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await waitFor(() => document.body.innerText.includes('Loaded draft: "Isolation draft"'), 'Draft load did not complete');
    pickCenter();
    await waitFor(() => field('Culture (county-scoped)')?.value === 'draft_culture', 'Draft metadata did not survive reload');
    if (field('Province Name').value !== 'Edited draft province') throw new Error('Draft used current disk definitions');
    await waitFor(() => document.body.innerText.includes('c_draft_renamed'), 'Staged title rename did not survive reload');
    shortcut(true);
    await waitFor(() => document.querySelector('[role="dialog"]')?.innerText.includes('External province'), 'Save to Mod did not warn about same-ID definition drift');
    click('Cancel');
    await new Promise(resolve => setTimeout(resolve, 20));
  `);
  assert.deepEqual(await originalFiles(modA), driftBaseline, 'Draft load or cancelled mod save wrote to original files');
  await run(`
    shortcut(true);
    await waitFor(() => button('Write to Mod'), 'Explicit mod-save confirmation missing');
    click('Write to Mod');
    await waitFor(() => button('Keep All & Save'), 'Always-visible keep-and-save action missing');
    if (!document.body.innerText.includes('c_orphans')) throw new Error('Empty parent title was not detected');
    const row = Array.from(document.querySelectorAll('label')).find(element => element.textContent.includes('Orphan two'));
    row.querySelector('input').click();
    await waitFor(() => !document.body.innerText.includes('c_orphans'), 'Keeping a province did not protect its parent title');
    click('Keep All & Save');
    await waitFor(() => document.body.innerText.includes('Saved provinces.png + mod files'), 'Explicit save to mod failed');
  `);
  assert.match(await fs.readFile(path.join(modA, 'map_data/definition.csv'), 'utf8'), /1;12;34;56;Edited draft province/);
  assert.match(await fs.readFile(path.join(modA, 'map_data/definition.csv'), 'utf8'), /3;80;90;100;Orphan three/);
  assert.match(await fs.readFile(path.join(modA, 'history/provinces/original.txt'), 'utf8'), /draft_culture/);
  assert.match(await fs.readFile(path.join(modA, 'common/landed_titles/original.txt'), 'utf8'), /c_draft_renamed/);
  assert.match(await fs.readFile(path.join(modA, 'common/landed_titles/original.txt'), 'utf8'), /c_orphans/);
  assert.deepEqual(await originalFiles(modB), beforeB, 'Draft workflow changed another mod');
  // Include pending provinces to catch ID prompts appearing after reconciliation writes.
  await run(`
    const loaded = await window.mapPainter.loadMod(arg);
    const provinces = loaded.data.provinces;
    const sourceDefinitions = structuredClone(provinces);
    provinces.find(p => p.id === 3).culture = 'renumbered_draft_culture';
    const pending = { id: 4, color: { r: 11, g: 22, b: 33 }, name: 'Pending four', request: {
      color: { r: 11, g: 22, b: 33 }, name: 'Pending four', titleTier: 'b', culture: 'pending_culture', parentTitle: 'c_draft_renamed',
    }};
    provinces.push({ id: pending.id, color: pending.color, name: pending.name, isNew: true, culture: 'pending_culture' });
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set([12,34,56,255], i);
    pixels.set([11,22,33,255], 0);
    await window.mapPainter.saveDraft(arg, 'Renumber draft', pixels, 32, 32, {
      provinces, sourceDefinitions, modifiedProvinceIds: [3],
      titleRenames: [{ oldKey: 'c_draft_renamed', newKey: 'c_confirmed_only' }],
      pendingProvinces: [pending], pendingSaveOptions: { definitionCsv: true, historyStubs: true, landedTitles: true, terrainEntries: true }, emptyColors: [], lockedColor: null,
    });
    click('Load Draft');
    await waitFor(() => Array.from(document.querySelectorAll('div')).some(element => visible(element) && element.children.length === 0 && element.textContent === 'Renumber draft'), 'Renumber draft missing');
    const name = Array.from(document.querySelectorAll('div')).find(element => visible(element) && element.children.length === 0 && element.textContent === 'Renumber draft');
    name.parentElement.parentElement.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await waitFor(() => document.body.innerText.includes('Loaded draft: "Renumber draft"'), 'Renumber draft did not load');
  `, modA);

  // Every cancellation must preserve all files, drafts, backups and directory entries.
  const cancelBaseline = await snapshotAll(modA);
  const callsBeforeCancel = writeCalls.length;
  await run(`
    shortcut(true);
    await waitFor(() => button('Write to Mod'), 'Save confirmation missing before orphan cancellation');
  `);
  assert.equal(writeCalls.length, callsBeforeCancel, 'Writes occurred while save confirmation was open');
  assert.deepEqual(await snapshotAll(modA), cancelBaseline);
  await run(`
    click('Write to Mod');
    await waitFor(() => button('Keep All & Save'), 'Orphan dialog missing before cancellation');
  `);
  assert.equal(writeCalls.length, callsBeforeCancel, 'Writes occurred before orphan approval');
  assert.deepEqual(await snapshotAll(modA), cancelBaseline);
  await run(`
    click('Cancel');
    await waitFor(() => document.body.innerText.includes('Save cancelled — orphaned provinces detected'), 'Orphan cancellation did not return to editing');
    if (!button('Pending (1)')) throw new Error('Cancelling save lost the pending province');
  `);
  assert.equal(writeCalls.length, callsBeforeCancel, 'Orphan cancellation called a write operation');
  assert.deepEqual(await snapshotAll(modA), cancelBaseline, 'Orphan cancellation changed files, drafts or backups');

  // External IDs require a separate confirmation; cancelling it must also write nothing.
  const definitionsBeforeDrift = await fs.readFile(path.join(modA, 'map_data/definition.csv'), 'utf8');
  await fs.appendFile(path.join(modA, 'map_data/definition.csv'), '8;101;102;103;External eight;x;\n');
  const driftCancelBaseline = await snapshotAll(modA);
  await run(`
    shortcut(true);
    await waitFor(() => button('Write to Mod'), 'Definition-drift review missing');
    click('Write to Mod');
    await waitFor(() => button('Continue with Save') || button('Keep All & Save'), 'Save did not reach a confirmation');
    // Handle the previous ordering too, so the regression detects actual premature writes.
    if (button('Keep All & Save')) {
      click('Keep All & Save');
      await waitFor(() => button('Continue with Save'), 'ID-drift confirmation missing');
    }
  `);
  assert.equal(writeCalls.length, callsBeforeCancel, 'Writes occurred before ID-drift approval');
  assert.deepEqual(await snapshotAll(modA), driftCancelBaseline);
  await run(`
    click('Cancel');
    await waitFor(() => document.body.innerText.includes('Save cancelled — ID drift not confirmed'), 'ID-drift cancellation did not return to editing');
    click('Pending (1)');
    await waitFor(() => document.body.innerText.includes('#4'), 'Cancelling ID drift changed pending province IDs');
  `);
  assert.equal(writeCalls.length, callsBeforeCancel, 'ID-drift cancellation called a write operation');
  assert.deepEqual(await snapshotAll(modA), driftCancelBaseline, 'ID-drift cancellation changed files or backups');
  await run(`
    shortcut(true);
    await waitFor(() => button('Write to Mod'), 'Definition review missing before full confirmation chain');
    click('Write to Mod');
    await waitFor(() => button('Continue with Save'), 'ID review must precede orphan review');
    click('Continue with Save');
    await waitFor(() => button('Keep All & Save'), 'Orphan review did not follow ID confirmation');
  `);
  assert.equal(writeCalls.length, callsBeforeCancel, 'Confirming ID drift wrote before orphan approval');
  assert.deepEqual(await snapshotAll(modA), driftCancelBaseline);
  await run(`
    click('Cancel');
    await waitFor(() => document.body.innerText.includes('Save cancelled — orphaned provinces detected'), 'Final orphan cancellation did not return to editing');
  `);
  assert.equal(writeCalls.length, callsBeforeCancel, 'Final orphan cancellation invoked a write');
  assert.deepEqual(await snapshotAll(modA), driftCancelBaseline, 'Cancelling after ID approval changed files or backups');
  await fs.writeFile(path.join(modA, 'map_data/definition.csv'), definitionsBeforeDrift);

  await run(`
    shortcut(true);
    await waitFor(() => button('Write to Mod'), 'Renumber save confirmation missing');
    click('Write to Mod');
    await waitFor(() => button('Keep All & Save'), 'Renumber orphan dialog missing');
    const keep = Array.from(document.querySelectorAll('label')).find(element => element.textContent.includes('Orphan three'));
    keep.querySelector('input').click();
    await waitFor(() => button('Remove & Renumber (1)'), 'Removal selection did not update');
    click('Remove & Renumber (1)');
    await waitFor(() => !button('Keep All & Save'), 'Approved orphan dialog did not close');
    await waitFor(() => {
      if (button('Continue with Save') || button('Write to Mod') || button('Keep All & Save')) throw new Error('A required confirmation appeared after reconciliation started writing');
      return document.body.innerText.includes('Saved provinces.png + mod files');
    }, 'Reconciled save failed');
  `);
  const renumberedDefinitions = await fs.readFile(path.join(modA, 'map_data/definition.csv'), 'utf8');
  assert.match(renumberedDefinitions, /2;80;90;100;Orphan three/);
  assert.doesNotMatch(renumberedDefinitions, /Orphan two/);
  assert.match(renumberedDefinitions, /3;11;22;33;Pending four/);
  assert.match(await fs.readFile(path.join(modA, 'common/landed_titles/original.txt'), 'utf8'), /c_confirmed_only/);
  const historyNames = await fs.readdir(path.join(modA, 'history/provinces'));
  const histories = (await Promise.all(historyNames.map(name => fs.readFile(path.join(modA, 'history/provinces', name), 'utf8')))).join('\n');
  assert.match(histories, /2\s*=\s*\{[^}]*renumbered_draft_culture/s);
  assert.match(await fs.readFile(path.join(modA, 'common/landed_titles/original.txt'), 'utf8'), /c_orphans/);
  assert.deepEqual(await originalFiles(modB), beforeB, 'Reconciliation changed another mod');
  console.log('Draft/save safety: snapshots, picker cancellation, zero writes before confirmation or after cancellation, and no late dialogs during reconciliation passed');
};
