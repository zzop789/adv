import { BrowserWindow } from 'electron';
import path from 'node:path';
import type { DesktopContext } from './context';

export async function createWindow(context: DesktopContext) {
  const { config } = context;
  const window = new BrowserWindow({
    width: 1280, height: 840, minWidth: 900, minHeight: 680,
    show: false, backgroundColor: '#101213', title: __ADV_GAME_TITLE__, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
    },
  });
  context.window = window;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) { context.generation += 1; context.contents.clear(); }
  });
  window.on('closed', () => {
    context.window = null;
    context.generation += 1;
    context.contents.clear();
  });
  window.once('ready-to-show', () => { if (!config.hiddenTest) window.show(); });
  await window.loadURL(config.rendererUrl);
}
