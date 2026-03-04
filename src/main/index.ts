/**
 * Electron main process entry point.
 * Creates the browser window and registers IPC handlers.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let forceClose = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: "Ven0m's Map Painter",
    backgroundColor: '#0a0a1a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev, ELECTRON_RENDERER_URL is set by electron-vite
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Intercept window close — ask renderer if there are unsaved draft changes
  mainWindow.on('close', (e) => {
    if (forceClose) return; // Renderer confirmed close, let it proceed
    e.preventDefault();
    mainWindow?.webContents.send('check-before-close');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Renderer confirms it's OK to close (either no dirty state, or user chose to discard/save)
ipcMain.on('confirm-close', () => {
  forceClose = true;
  mainWindow?.close();
});

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
