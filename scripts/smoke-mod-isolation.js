const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function snapshot(root) {
  const contents = {};
  for (const relative of await fs.readdir(root, { recursive: true })) {
    const file = path.join(root, relative);
    if ((await fs.stat(file)).isFile()) contents[relative] = (await fs.readFile(file)).toString('hex');
  }
  return contents;
}

/** Open B in a second tab, then paint and save A through its real UI. */
module.exports = async function smokeModIsolation(window, ipcMain, tempDir, modA) {
  const modB = path.join(tempDir, 'mod-b');
  await fs.mkdir(path.join(modB, 'map_data'), { recursive: true });
  await fs.mkdir(path.join(modB, 'history/provinces'), { recursive: true });
  await fs.writeFile(path.join(modB, 'map_data/definition.csv'),
    '0;0;0;0;x;x;\n1;201;123;45;Untouched B;x;\n');
  await fs.writeFile(path.join(modB, 'history/provinces/b.txt'), '1 = {\n culture = untouched_b\n}\n');
  ipcMain.removeHandler('select-directory');
  ipcMain.handle('select-directory', () => modB);

  await window.webContents.executeJavaScript(`(async () => {
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set([201, 123, 45, 255], i);
    await window.mapPainter.saveImage(${JSON.stringify(modB)}, pixels, 32, 32);
    const tabBar = document.querySelector('#root').firstElementChild.firstElementChild;
    const addTab = Array.from(tabBar.children).find(element => element.textContent.trim() === '+');
    if (!addTab) throw new Error('Add tab control missing');
    addTab.click();
    await new Promise(resolve => setTimeout(resolve, 20));
    const open = Array.from(document.querySelectorAll('button'))
      .find(element => element.textContent.trim() === 'Open Map' && element.getClientRects().length);
    if (!open || open.disabled) throw new Error('Second tab is not ready to open a map');
    open.click();
    const deadline = Date.now() + 4000;
    while (!document.body.innerText.includes('Loaded 32x32 map')) {
      if (Date.now() >= deadline) throw new Error('Second tab did not load mod B');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  })()`);

  // Include load-time backups in B's baseline; saving A must not add any more.
  const beforeB = await snapshot(modB);
  const beforeA = await fs.readFile(path.join(modA, 'map_data/provinces.png'));

  await window.webContents.executeJavaScript(`(async () => {
    const waitFor = async (predicate, message) => {
      const deadline = Date.now() + 4000;
      while (!predicate()) {
        if (Date.now() >= deadline) throw new Error(message);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    document.querySelector('#root').firstElementChild.firstElementChild.children[0].click();
    await new Promise(resolve => setTimeout(resolve, 20));
    const canvas = Array.from(document.querySelectorAll('canvas'))
      .find(element => element.getClientRects().length);
    const rect = canvas.getBoundingClientRect();
    const event = { button: 0, bubbles: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    // Erase a small patch, then paint it: border protection stays enabled.
    for (const key of ['e', 'b']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 20));
      canvas.dispatchEvent(new MouseEvent('mousedown', event));
      canvas.dispatchEvent(new MouseEvent('mouseup', event));
    }
    await waitFor(() => Array.from(document.querySelectorAll('button'))
      .some(element => element.getClientRects().length && element.textContent.trim() === 'Pending (1)'),
      'Painting A did not create a pending province');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true, bubbles: true }));
    await waitFor(() => document.body.innerText.includes('Saved provinces.png + mod files'),
      'Saving A after opening B did not complete');
  })()`);

  assert.match(await fs.readFile(path.join(modA, 'map_data/definition.csv'), 'utf8'), /^2;/m,
    'A definition.csv did not receive the new province');
  assert.notDeepEqual(await fs.readFile(path.join(modA, 'map_data/provinces.png')), beforeA,
    'A image was not saved');
  assert.deepEqual(await snapshot(modB), beforeB, 'Saving A changed files or backups in B');
  console.log('Two-tab isolation: painted/saved A after opening B; all B files and backups unchanged');
};
