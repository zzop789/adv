import { app, BrowserWindow, ipcMain, Menu, net, protocol, session } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadGameContent, resolveContentFile } from './content';
import { ContentRegistry } from './content-registry';
import type { GameLoadResult } from '../runtime/types';

protocol.registerSchemesAsPrivileged([
  { scheme: 'adv-app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'adv-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const hiddenTest = process.env.ADV_SMOKE_TEST === '1';
const projectRoot = path.resolve(__dirname, '..');
const devUrl = !app.isPackaged && __ADV_GAME_SOURCE__ !== null && process.env.ADV_DEV_SERVER_URL === 'http://127.0.0.1:5173'
  ? process.env.ADV_DEV_SERVER_URL : undefined;
const gameDirectory = devUrl && __ADV_GAME_SOURCE__ ? __ADV_GAME_SOURCE__ : path.join(projectRoot, 'games', __ADV_GAME_ID__);
const rendererUrl = devUrl ?? 'adv-app://app/index.html';
let window: BrowserWindow | null = null;
const contents = new ContentRegistry();
let rendererGeneration = 0;

app.setName(__ADV_GAME_TITLE__);
app.setPath('userData', path.join(app.getPath('appData'), `${__ADV_APP_ID__}${hiddenTest ? '.smoke' : ''}`));
if (process.platform === 'win32') app.setAppUserModelId(__ADV_APP_ID__);

function verifySender(event: IpcMainInvokeEvent): BrowserWindow {
  if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('不支持的调用来源。');
  }
  const source = event.senderFrame.url;
  if (devUrl ? new URL(source).origin !== devUrl : source !== rendererUrl) throw new Error('不支持的页面。');
  return window;
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 680,
    show: false,
    backgroundColor: '#101213',
    title: __ADV_GAME_TITLE__,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      rendererGeneration += 1;
      contents.clear();
    }
  });
  window.on('closed', () => { window = null; rendererGeneration += 1; contents.clear(); });
  window.once('ready-to-show', () => { if (!hiddenTest) window?.show(); });
  await window.loadURL(rendererUrl);
}

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  protocol.handle('adv-media', (request) => contents.serve(request));
  protocol.handle('adv-app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'app') return new Response(null, { status: 404 });
      const relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      const file = await resolveContentFile(path.join(projectRoot, 'dist'), relative);
      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response(null, { status: 404 });
    }
  });
  ipcMain.handle('adv:load-game', async (event): Promise<GameLoadResult> => {
    const owner = verifySender(event);
    const generation = rendererGeneration;
    try {
      const content = await loadGameContent(gameDirectory);
      if (content.game.id !== __ADV_GAME_ID__) throw new Error('作品 ID 与构建目标不一致，请重新构建。');
      const icon = await resolveContentFile(content.root, content.build.icon);
      if (generation !== rendererGeneration || owner.isDestroyed()) throw new Error('预览页面已关闭或刷新，本次内容加载已取消。');
      owner.setIcon(icon);
      owner.setTitle(content.game.title);
      return { ok: true, value: contents.register(content, Boolean(devUrl)) };
    } catch (error) {
      console.error('作品加载失败', error);
      return { ok: false, error: error instanceof Error ? error.message : '作品内容无法读取。' };
    }
  });
  ipcMain.handle('adv:release-game', (event, loadId: unknown) => {
    verifySender(event);
    if (typeof loadId !== 'string') throw new Error('内容加载标识不正确。');
    contents.release(loadId);
  });
  ipcMain.handle('adv:set-fullscreen', (event, value: unknown) => {
    const owner = verifySender(event);
    if (typeof value !== 'boolean') throw new Error('全屏参数不正确。');
    owner.setFullScreen(value);
    return value;
  });
  ipcMain.handle('adv:get-fullscreen', (event) => verifySender(event).isFullScreen());
  await createWindow();
}).catch((error) => { console.error(error); app.exit(1); });

app.on('window-all-closed', () => app.quit());
