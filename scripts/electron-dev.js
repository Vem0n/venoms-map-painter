/**
 * Launcher script that removes ELECTRON_RUN_AS_NODE from the environment
 * before spawning electron-vite. This is needed because VS Code sets
 * ELECTRON_RUN_AS_NODE=1, which prevents Electron from initializing
 * its main process APIs (app, BrowserWindow, etc.).
 */
const { spawn } = require('child_process');
const path = require('path');

// Remove the env var that breaks Electron
delete process.env.ELECTRON_RUN_AS_NODE;

const subcmd = process.argv[2] || 'dev'; // 'dev' or 'preview'

// On Windows, spawn .cmd wrappers via shell with the command as a single string
if (process.platform === 'win32') {
  const binPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-vite.cmd');
  const child = spawn(`"${binPath}" ${subcmd}`, {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  const binPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-vite');
  const child = spawn(binPath, [subcmd], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
