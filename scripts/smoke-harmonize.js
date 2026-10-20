const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');

/** Exercise the real Voronoi → independent color picker → harmonize → draft pipeline. */
module.exports = async function smokeHarmonize(window, ipcMain, tempDir) {
  const modPath = path.join(tempDir, 'harmonize-mod');
  await fs.mkdir(path.join(modPath, 'map_data'), { recursive: true });
  const definitions = '0;0;0;0;x;x;\n1;224;32;32;Province A;x;\n2;24;90;180;Blob B;x;\n';
  await fs.writeFile(path.join(modPath, 'map_data/definition.csv'), definitions);
  const original = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    original.data.set(x < 16 ? [224, 32, 32, 255] : [24, 90, 180, 255], (y * 64 + x) * 4);
  }
  const originalPng = PNG.sync.write(original);
  await fs.writeFile(path.join(modPath, 'map_data/provinces.png'), originalPng);
  ipcMain.removeHandler('select-directory');
  ipcMain.handle('select-directory', () => modPath);
  const run = body => window.webContents.executeJavaScript(`(async () => {
    const visible = element => element.getClientRects().length;
    const button = label => Array.from(document.querySelectorAll('button')).filter(visible).find(element => element.textContent.trim() === label);
    const click = label => { const element = button(label); if (!element || element.disabled) throw new Error('Button unavailable: ' + label); element.click(); };
    const waitFor = async (predicate, message) => { const end = Date.now() + 5000; while (!predicate()) { if (Date.now() >= end) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 20)); } };
    const tick = () => new Promise(resolve => setTimeout(resolve, 25));
    const setInput = (input, value) => { if (!input) throw new Error('Input missing'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
    const field = name => document.querySelector('input[aria-label="' + name + '"]');
    const tile = () => Array.from(document.querySelectorAll('button[aria-label="Harmonize base color"]')).find(visible);
    const canvas = () => Array.from(document.querySelectorAll('canvas')).find(visible);
    const point = (x, y) => { const rect = canvas().getBoundingClientRect(); const zoom = Math.min(rect.width / 64, rect.height / 64); return { button: 0, bubbles: true, clientX: rect.left + rect.width / 2 + (x - 32) * zoom, clientY: rect.top + rect.height / 2 + (y - 32) * zoom }; };
    const sample = async (x, y) => { const event = point(x,y); canvas().dispatchEvent(new MouseEvent('mousedown', event)); canvas().dispatchEvent(new MouseEvent('mouseup', event)); await tick(); };
    const selectBlob = async () => {
      canvas().dispatchEvent(new MouseEvent('mousedown', point(16.1, 0.1)));
      for (const [x,y] of [[63.9,0.1], [63.9,63.9], [16.1,63.9]]) canvas().dispatchEvent(new MouseEvent('mousemove', point(x,y)));
      canvas().dispatchEvent(new MouseEvent('mouseup', point(16.1,63.9)));
      await waitFor(() => tile(), 'Selection color tile missing');
    };
    ${body}
  })()`);

  await run(`
    const tabBar = document.querySelector('#root').firstElementChild.firstElementChild;
    Array.from(tabBar.children).find(element => element.textContent.trim() === '+').click();
    await tick(); click('Open Map');
    await waitFor(() => document.body.innerText.includes('Loaded 64x64 map') && button('Open Map') && !button('Open Map').disabled, 'Harmonize fixture did not load');
    click('Create');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true })); await tick();
    await sample(32,32);
    await waitFor(() => tile(), 'Initial selection missing');
    if (!tile().title.includes('#185AB4')) throw new Error('Color tile was not seeded from selected B');
    click('Clear');
    click('Select Province'); await tick(); await sample(32,32);
    await waitFor(() => document.body.innerText.includes('Preview: 10 sub-provinces'), 'Voronoi fixture preview missing');
    const slider = Array.from(document.querySelectorAll('input[type="range"]')).filter(visible).find(input => input.max === '100');
    if (!slider) throw new Error('Voronoi count slider missing');
    setInput(slider, '60');
    await waitFor(() => document.body.innerText.includes('Preview: 60 sub-provinces'), '60-province preview missing');
    click('Confirm');
    await waitFor(() => document.body.innerText.includes('Generated 60 sub-provinces'), '60-province generation did not complete');
    await selectBlob();
    await waitFor(() => document.body.innerText.includes('60 provinces'), 'Did not select all 60 B provinces');
    tile().click(); await tick();
    const dialog = document.querySelector('[role="dialog"][aria-label="Harmonize color"]');
    if (!dialog) throw new Error('Harmonize picker missing');
    // Typing must not activate editor shortcuts, including L and Ctrl+S.
    field('Harmonize hex').dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    if (document.querySelector('h2')?.textContent === 'Save Draft') throw new Error('Picker leaked Ctrl+S');
    setInput(field('Harmonize hex'), '#E02020'); await tick();
    if (field('Harmonize R').value !== '224' || field('Harmonize G').value !== '32') throw new Error('Hex did not update RGB');
    setInput(field('Harmonize R'), '200'); await tick();
    if (field('Harmonize hex').value !== '#C82020') throw new Error('RGB did not update hex');
    setInput(field('Harmonize hex'), '#GGGGGG'); await tick();
    if (field('Harmonize hex').getAttribute('aria-invalid') !== 'true') throw new Error('Invalid hex was accepted');
    field('Harmonize hex').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await tick();
    if (field('Harmonize hex').value !== '#C82020') throw new Error('Invalid hex did not revert');
    setInput(field('Harmonize hex'), '#E02020'); await tick();
    const strengthBefore = Number(field('Harmonize color strength').value);
    setInput(field('Harmonize color strength'), '30'); await tick();
    if (field('Harmonize hex').value === '#E02020') throw new Error('Strength slider had no effect');
    setInput(field('Harmonize color strength'), String(strengthBefore)); await tick();
    setInput(field('Harmonize hex'), '#E02020'); await tick();
    document.querySelector('[aria-label="Color saturation and brightness"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await tick();
    if (field('Harmonize hex').value === '#E02020') throw new Error('Visual picker keyboard adjustment had no effect');
    setInput(field('Harmonize hex'), '#E02020'); await tick();
    document.querySelector('[aria-label="Close harmonize color picker"]').click(); await tick();
    // Keep a different paint color to catch any remaining brush coupling.
    click('Paint'); await tick();
    const paintInputs = Array.from(document.querySelectorAll('input[type="number"]')).filter(visible).slice(0,3);
    for (const [i,value] of ['0','255','0'].entries()) { setInput(paintInputs[i],value); await tick(); }
    if (!tile().title.includes('#E02020')) throw new Error('Changing brush color changed harmonize seed');
    tile().click(); await tick();
    if (field('Harmonize hex').value !== '#E02020') throw new Error('Picker failed to retain color when reopened');
    document.querySelector('[role="dialog"][aria-label="Harmonize color"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
    if (!tile()) throw new Error('Picker Escape cleared selection');
    click('Harmonize');
    await waitFor(() => document.body.innerText.includes('Harmonized 60 province(s)'), 'Harmonize did not complete');
    // Undo and redo must preserve the pending province color remaps too.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); await tick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true })); await tick();
    click('Save Draft');
    await waitFor(() => document.querySelector('h2')?.textContent === 'Save Draft', 'Draft dialog missing');
    const draftDialog = document.querySelector('h2').parentElement;
    setInput(draftDialog.querySelector('input'), 'Harmonized 60'); await tick();
    draftDialog.querySelectorAll('button')[1].click();
    await waitFor(() => document.body.innerText.includes('Draft saved: "Harmonized 60"'), 'Harmonize draft save failed');
  `);

  const [draftName] = await fs.readdir(path.join(modPath, 'VMP-Drafts'));
  const draftRoot = path.join(modPath, 'VMP-Drafts', draftName);
  const metadata = JSON.parse(await fs.readFile(path.join(draftRoot, 'draft.json'), 'utf8'));
  const image = PNG.sync.read(await fs.readFile(path.join(draftRoot, 'provinces.png')));
  const keys = new Set();
  for (let y=0; y<64; y++) for (let x=0; x<64; x++) {
    const offset=(y*64+x)*4;
    const rgb=Array.from(image.data.subarray(offset, offset+3));
    if (x<16) assert.deepEqual(rgb, [224,32,32], 'Harmonize changed unselected A');
    else {
      assert.notDeepEqual(rgb, [224,32,32], 'A absorbed a harmonized B province');
      assert.ok(rgb[0]>rgb[1] && rgb[0]>rgb[2], 'Palette followed green brush instead of red harmonize seed');
      keys.add(rgb.join(','));
    }
  }
  assert.equal(keys.size, 60, 'B lost a distinct province');
  for (const pending of metadata.pendingProvinces) assert.ok(keys.has([pending.color.r,pending.color.g,pending.color.b].join(',')), 'Pending colors did not survive harmonize/undo/redo');
  assert.deepEqual(await fs.readFile(path.join(modPath, 'map_data/provinces.png')), originalPng);
  assert.equal(await fs.readFile(path.join(modPath, 'map_data/definition.csv'), 'utf8'), definitions);
  await run(`
    // A new selection starts from its own first province, rather than the previous override.
    await sample(8,32);
    if (!tile().title.includes('#E02020')) throw new Error('New selection did not reseed from A');
    tile().click(); await tick();
  `);
  // Keep a screenshot outside the temporary fixture for visual inspection when requested.
  if (process.env.VMP_HARMONIZE_SCREENSHOT) {
    await fs.writeFile(process.env.VMP_HARMONIZE_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
  }
  await run(`
    document.querySelector('[aria-label="Close harmonize color picker"]').click(); await tick();
    const activeTab = Array.from(document.querySelectorAll('[data-tab-id]')).find(element => element.textContent.includes('harmonize-mod'));
    activeTab.querySelector('button').click(); await tick();
    if (button("Don't Save")) click("Don't Save");
    await waitFor(() => !Array.from(document.querySelectorAll('[data-tab-id]')).some(element => element.textContent.includes('harmonize-mod')), 'Harmonize fixture tab did not close');
  `);
  console.log('Harmonize: independent visual/RGB/hex picker, strength, 60 unique provinces excluding A, undo/redo, pending colors and draft-only writes passed');
};
