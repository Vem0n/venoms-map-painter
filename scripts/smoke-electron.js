/** Exercise the real preload/IPC/PNG pipeline using only a temporary mod. */
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

// Electron retains Chromium switches in argv; locate the script before its app path.
const scriptIndex = process.argv.findIndex(argument => path.resolve(argument) === __filename);
const appRoot = path.resolve(process.argv[scriptIndex + 1] || path.join(__dirname, '..'));

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const switches = [];
  if (env.VMP_SMOKE_SOFTWARE_GPU === '1') switches.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  if (env.VMP_SMOKE_NO_SANDBOX === '1') switches.push('--no-sandbox');
  const child = spawn(require('electron'), [...switches, __filename, appRoot], { env, stdio: 'inherit' });
  child.on('error', (error) => { console.error(error); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
} else {
  const { app, ipcMain } = require('electron');
  // Record every IPC operation capable of writing, including map-load backups.
  const writeCalls = [];
  const faults = { beforeWrite: null };
  const writeChannels = new Set(['load-image', 'save-image', 'save-mod', 'rename-title',
    'create-province', 'flush-pending-provinces', 'reconcile-provinces', 'save-draft', 'delete-draft', 'report-save-failure', 'add-workshop-folder', 'rescan-project-library', 'remove-workshop-folder']);
  const register = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => register(channel, async (...args) => {
    if (writeChannels.has(channel)) writeCalls.push(channel);
    if (faults.beforeWrite) await faults.beforeWrite(channel, args);
    return listener(...args);
  });
  let tempDir;
  let finished = false;

  const finish = async (error) => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    if (error) console.error(error);
    try {
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
    } finally {
      // Bypass the application's interactive unsaved-changes guard in this test.
      app.exit(error ? 1 : 0);
    }
  };
  const deadline = setTimeout(() => finish(new Error('Electron smoke test timed out')), process.env.CI ? 180000 : 45000);

  (async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vmp-electron-smoke-'));
    app.setPath('userData', path.join(tempDir, 'profile'));
    const modPath = path.join(tempDir, 'mod');
    await fs.mkdir(path.join(modPath, 'map_data'), { recursive: true });

    app.on('browser-window-created', (_event, window) => {
      window.hide();
      window.webContents.on('render-process-gone', (_event, details) => {
        finish(new Error(`Renderer exited: ${details.reason}`));
      });
      window.webContents.once('did-finish-load', async () => {
        try {
          const result = await window.webContents.executeJavaScript(`(async () => {
            const api = window.mapPainter;
            if (!api) throw new Error('Preload bridge missing');
            const pixels = new Uint8Array([12, 34, 56, 0, 201, 123, 45, 128]);
            await api.saveImage(${JSON.stringify(modPath)}, pixels, 2, 1);
            const image = await api.loadImage(${JSON.stringify(modPath)});
            return {
              width: image.width,
              height: image.height,
              pixels: Array.from(image.buffer),
              uiLoaded: document.body.innerText.includes('Open Map'),
            };
          })()`);
          assert.equal(result.uiLoaded, true, 'Renderer UI failed to load');
          assert.equal(result.width, 2);
          assert.equal(result.height, 1);
          assert.deepEqual(result.pixels, [12, 34, 56, 255, 201, 123, 45, 255]);
          console.log(`Electron ${process.versions.electron}: UI, preload, IPC and exact RGB round-trip passed`);

          await require('./smoke-projects')(window, tempDir, writeCalls);

          // Open a temporary map through the real UI without showing a directory dialog.
          await fs.writeFile(path.join(modPath, 'map_data', 'definition.csv'),
            '0;0;0;0;x;x;\n1;12;34;56;Voronoi Test;x;\n');
          ipcMain.removeHandler('select-directory');
          ipcMain.handle('select-directory', () => modPath);
          await window.webContents.executeJavaScript(`(async () => {
            const waitFor = async (predicate, message) => {
              const end = Date.now() + 4000;
              while (!predicate()) {
                if (Date.now() >= end) throw new Error(message);
                await new Promise(resolve => setTimeout(resolve, 20));
              }
            };
            const button = label => Array.from(document.querySelectorAll('button'))
              .find(element => element.textContent.trim() === label);
            const click = label => {
              const element = button(label);
              if (!element || element.disabled) throw new Error('Button unavailable: ' + label);
              element.click();
            };

            const pixels = new Uint8Array(32 * 32 * 4);
            for (let i = 0; i < pixels.length; i += 4) {
              pixels.set([12, 34, 56, 255], i);
            }
            await window.mapPainter.saveImage(${JSON.stringify(modPath)}, pixels, 32, 32);
            click('Open Map');
            await waitFor(() => button('Select Province') && !button('Select Province').disabled,
              'Temporary mod did not load');
            click('Create');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 20));

            // Both a normal click and Shift-click must pick for Voronoi before lasso.
            for (const shiftKey of [false, true]) {
              click('Select Province');
              await waitFor(() => document.body.innerText.includes('Click on a province blob on the map'),
                'Generator picking mode did not activate');
              const canvas = document.querySelector('canvas');
              const rect = canvas.getBoundingClientRect();
              const event = { button: 0, bubbles: true, shiftKey,
                clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
              canvas.dispatchEvent(new MouseEvent('mousedown', event));
              canvas.dispatchEvent(new MouseEvent('mouseup', event));
              await waitFor(() => document.body.innerText.includes('Preview: 10 sub-provinces'),
                'Voronoi preview missing while lasso is active (shift=' + shiftKey + ')');
              click('Cancel');
              await waitFor(() => button('Select Province')?.getClientRects().length,
                'Cancel did not finish Voronoi picking');
            }
          })()`);
          console.log('Voronoi preview while lasso is active: normal click and Shift-click passed');
          await require('./smoke-hierarchy')(window, ipcMain, tempDir, writeCalls);
          await require('./smoke-harmonize')(window, ipcMain, tempDir);
          // Restore the original fixture picker after the harmonize helper.
          ipcMain.removeHandler('select-directory');
          ipcMain.handle('select-directory', () => modPath);
          await require('./smoke-mod-isolation')(window, ipcMain, tempDir, modPath);
          await require('./smoke-drafts')(window, ipcMain, tempDir, writeCalls);
          await require('./smoke-save-failure')(window, tempDir, faults);
          await require('./smoke-tab-close')(window, ipcMain, tempDir, writeCalls, faults);
          await finish();
        } catch (error) {
          await finish(error);
        }
      });
    });

    require(path.join(appRoot, 'dist/main/index.js'));
  })().catch(finish);
}
