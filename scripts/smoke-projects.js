const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');

async function snapshot(root) {
  const result = {};
  for (const relative of await fs.readdir(root, { recursive: true })) {
    const file = path.join(root, relative);
    const stat = await fs.stat(file, { bigint: true });
    result[relative] = stat.isDirectory() ? `directory:${stat.mtimeNs}` : `${stat.mtimeNs}:${(await fs.readFile(file)).toString('hex')}`;
  }
  return result;
}

module.exports = async function smokeProjects(window, tempDir, writeCalls) {
  const workshop = path.join(tempDir, 'workshop-content');
  const masterPath = path.join(tempDir, 'profile/projects.json');
  const create = async (id, name, color = [12, 34, 56]) => {
    const modPath = path.join(workshop, id);
    await fs.mkdir(path.join(modPath, 'map_data'), { recursive: true });
    await fs.mkdir(path.join(modPath, 'history/provinces'), { recursive: true });
    await fs.writeFile(path.join(modPath, 'descriptor.mod'), `name = "${name}"\n`);
    await fs.writeFile(path.join(modPath, 'map_data/definition.csv'), `0;0;0;0;x;x;\n1;${color.join(';')};${name} province;x;\n`);
    await fs.writeFile(path.join(modPath, 'history/provinces/test.txt'), '1 = {\n culture = original_culture\n}\n');
    const pixels = Buffer.alloc(16 * 16 * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set([...color, 255], i);
    await fs.writeFile(path.join(modPath, 'map_data/provinces.png'), PNG.sync.write({ width: 16, height: 16, data: pixels }));
    return modPath;
  };
  const alpha = await create('100', 'AGOT Test');
  const beta = await create('200', 'Elder Kings Test', [67, 89, 101]);
  for (let i = 0; i < 18; i++) await create(String(300 + i), `Extra map ${i}`);
  const invalid = await create('998', 'Not a map project');
  await fs.unlink(path.join(invalid, 'map_data/definition.csv'));

  const run = (body, arg = null) => window.webContents.executeJavaScript(`(async (arg) => {
    const visible = element => element.getClientRects().length;
    const button = label => Array.from(document.querySelectorAll('button')).filter(visible).find(element => element.textContent.trim() === label);
    const click = label => { const element = button(label); if (!element || element.disabled) throw new Error('Button unavailable: ' + label); element.click(); };
    const waitFor = async (predicate, message) => { const end = Date.now() + 5000; while (!predicate()) { if (Date.now() >= end) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 20)); } };
    const setInput = (input, value) => { if (!input) throw new Error('Input missing'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
    const rows = () => Array.from(document.querySelectorAll('[data-project-path]'));
    const findProject = name => rows().find(row => row.textContent.includes(name));
    const openProjects = async () => { await waitFor(() => button('Projects') && !button('Projects').disabled, 'Project loading did not finish'); click('Projects'); await waitFor(() => document.querySelector('#projects-title') && !button('Add Workshop Folder').disabled, 'Project picker did not load'); };
    const selectProject = async name => { const row = findProject(name); if (!row) throw new Error('Project missing: ' + name); row.click(); await waitFor(() => !button('Open Project').disabled, 'Selected project cannot be opened'); };
    const tabName = () => document.querySelector('[data-tab-id] > span').textContent;
    ${body}
  })(${JSON.stringify(arg)})`);

  const { dialog } = require('electron');
  const originalPicker = dialog.showOpenDialog;
  let pickerCalls = 0;
  dialog.showOpenDialog = async () => { pickerCalls++; return { canceled: false, filePaths: [workshop] }; };
  try {
    const original = await snapshot(workshop);
    const beforeDiscovery = writeCalls.length;
    await run(`
      await openProjects();
      if (!document.body.innerText.includes('Add a Workshop folder to discover projects.')) throw new Error('Empty project picker has no guidance');
      click('Add Workshop Folder');
      await waitFor(() => rows().length === 20 && !button('Rescan').disabled, 'Workshop discovery did not find map projects');
      if (!findProject('AGOT Test') || !findProject('Elder Kings Test') || findProject('Not a map project')) throw new Error('Project names or map filtering are wrong');
      const list = document.querySelector('[role="listbox"]');
      if (list.scrollHeight <= list.clientHeight) throw new Error('Project list cannot scroll');
      setInput(document.querySelector('[aria-label="Search projects"]'), 'elder');
      await waitFor(() => rows().length === 1 && !!findProject('Elder Kings Test'), 'Searching by display name failed');
      setInput(document.querySelector('[aria-label="Search projects"]'), '100');
      await waitFor(() => rows().length === 1 && !!findProject('AGOT Test'), 'Searching by Workshop ID failed');
    `);
    assert.deepEqual(await snapshot(workshop), original, 'Discovery wrote files or created mod backups/drafts');
    assert.deepEqual(writeCalls.slice(beforeDiscovery), ['add-workshop-folder'], 'Discovery invoked a mod write');
    const master = JSON.parse(await fs.readFile(masterPath, 'utf8'));
    assert.equal(master.projects.length, 20);
    assert.equal(master.workshopFolders[0], await fs.realpath(workshop));
    await run(`
      await selectProject('AGOT Test');
      click('Open Project');
      await waitFor(() => document.body.innerText.includes('Loaded 16x16 map') && tabName() === 'AGOT Test', 'Project did not open with its descriptor name');
      click('Inspect');
      await new Promise(resolve => setTimeout(resolve, 20));
      const canvas = document.querySelector('canvas'); const rect = canvas.getBoundingClientRect();
      const event = { button: 0, bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      canvas.dispatchEvent(new MouseEvent('mousedown', event)); canvas.dispatchEvent(new MouseEvent('mouseup', event));
      await waitFor(() => document.querySelector('input[placeholder="e.g. french"]'), 'Project province could not be inspected');
      setInput(document.querySelector('input[placeholder="e.g. french"]'), 'project_draft_culture');
      await waitFor(() => tabName().includes('•'), 'Project edits did not become dirty');
    `);
    assert.equal(pickerCalls, 1, 'Opening a known project prompted for its numeric folder');
    const betaBefore = await snapshot(beta);
    const cancelCalls = writeCalls.length;
    await run(`
      await openProjects();
      await selectProject('Elder Kings Test');
      click('Open Project');
      await waitFor(() => document.querySelector('h2')?.textContent === 'Unsaved Draft Changes', 'Project switch skipped unsaved edits');
      click('Cancel');
      await waitFor(() => !document.querySelector('h2'), 'Project switch cancellation did not finish');
      if (!tabName().startsWith('AGOT Test')) throw new Error('Cancelled project switch changed the current project label');
    `);
    assert.equal(writeCalls.length, cancelCalls, 'Cancelled project switch wrote files');
    assert.deepEqual(await snapshot(beta), betaBefore, 'Cancelled project switch touched the other mod');

    await run(`
      await openProjects(); await selectProject('Elder Kings Test'); click('Open Project');
      await waitFor(() => document.querySelector('h2')?.textContent === 'Unsaved Draft Changes', 'Second project switch has no guard');
      const guard = document.querySelector('h2').parentElement;
      Array.from(guard.querySelectorAll('button')).find(element => element.textContent === 'Save Draft').click();
      await waitFor(() => tabName() === 'Elder Kings Test' && document.body.innerText.includes('Loaded 16x16 map'), 'Save-then-switch did not open the chosen project');
    `);
    const drafts = await fs.readdir(path.join(alpha, 'VMP-Drafts'));
    const metadata = JSON.parse(await fs.readFile(path.join(alpha, 'VMP-Drafts', drafts[0], 'draft.json'), 'utf8'));
    assert.equal(metadata.modPath, alpha);
    assert.equal(metadata.provinces[0].culture, 'project_draft_culture');
    assert.match(await fs.readFile(path.join(alpha, 'history/provinces/test.txt'), 'utf8'), /original_culture/);
    assert.equal(pickerCalls, 1);

    // Draft picking uses the selected project while preserving the current save target until loading.
    const beforeDraftPicker = writeCalls.length;
    await run(`
      await openProjects(); await selectProject('AGOT Test'); click('Load Project Draft');
      await waitFor(() => document.querySelector('h2')?.textContent === 'Load Draft', 'Project draft picker did not open');
      click('Cancel');
      await waitFor(() => !document.querySelector('h2'), 'Project draft picker cancellation failed');
      if (tabName() !== 'Elder Kings Test') throw new Error('Cancelled draft picking changed the active project');
      await openProjects(); await selectProject('AGOT Test'); click('Load Project Draft');
      await waitFor(() => document.querySelector('h2')?.textContent === 'Load Draft', 'Project drafts were not listed again');
      const name = Array.from(document.querySelectorAll('div')).find(element => visible(element) && element.children.length === 0 && element.textContent === 'Auto-save');
      if (!name) throw new Error('Saved project draft is missing');
      name.parentElement.parentElement.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await waitFor(() => document.body.innerText.includes('Loaded draft: "Auto-save"') && tabName() === 'AGOT Test', 'Project draft did not restore the correct project');
    `);
    assert.equal(writeCalls.length, beforeDraftPicker, 'Project draft loading unexpectedly wrote files');
    assert.equal(pickerCalls, 1, 'Project draft loading prompted for a numeric mod folder');

    // Workshop updates are reflected only by a rescan, with no mod-side writes.
    await fs.writeFile(path.join(beta, 'descriptor.mod'), 'name = "Elder Kings Updated"\n');
    await create('999', 'New Workshop Map');
    await fs.rename(path.join(alpha, 'map_data/definition.csv'), path.join(alpha, 'map_data/definition.saved'));
    const beforeRescan = await snapshot(workshop);
    await run(`
      await openProjects(); click('Rescan');
      await waitFor(() => !button('Rescan').disabled && !!findProject('Elder Kings Updated') && !!findProject('New Workshop Map'), 'Rescan did not refresh project names and subscriptions');
      if (findProject('AGOT Test')) throw new Error('Rescan kept a project that no longer has definitions');
      click('Close');
    `);
    assert.deepEqual(await snapshot(workshop), beforeRescan, 'Rescanning changed mod files, drafts or backups');

    await new Promise(resolve => { window.webContents.once('did-finish-load', resolve); window.webContents.reload(); });
    await run(`
      await waitFor(() => button('Projects'), 'Reloaded UI did not start');
      await openProjects();
      if (!findProject('Elder Kings Updated') || !findProject('New Workshop Map') || findProject('AGOT Test')) throw new Error('Project list did not persist after renderer restart');
      click('Remove Folder');
      await waitFor(() => !button('Rescan') || button('Rescan').disabled, 'Folder removal did not update the library');
      if (rows().length) throw new Error('Forgetting a Workshop folder left stale projects');
      click('Close');
    `);
    assert.deepEqual(await snapshot(workshop), beforeRescan, 'Removing a library folder deleted or changed mod files');
    assert.equal(JSON.parse(await fs.readFile(masterPath, 'utf8')).projects.length, 0);
    console.log('Project library: read-only discovery, search/scroll, app-data persistence, guarded project/draft opening, rescan and metadata-only removal passed');
  } finally {
    dialog.showOpenDialog = originalPicker;
  }
};
