import { app, Menu, session } from 'electron';
import path from 'node:path';
import { desktopEnvironment } from './app/environment';
import { createDesktopContext } from './app/context';
import { createWindow } from './app/window';
import { declareProtocols, registerProtocols } from './media/protocols';
import { registerContentHandlers } from './ipc/content';
import { registerWindowHandlers } from './ipc/window';
import { registerAuthoringHandlers } from './ipc/authoring';

declareProtocols();
const context = createDesktopContext(desktopEnvironment());
app.setName(__ADV_GAME_TITLE__);
app.setPath('userData', path.join(app.getPath('appData'), __ADV_APP_ID__ + (context.config.hiddenTest ? '.smoke' : '')));
if (process.platform === 'win32') app.setAppUserModelId(__ADV_APP_ID__);

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  registerProtocols(context);
  registerContentHandlers(context);
  registerWindowHandlers(context);
  registerAuthoringHandlers(context);
  await createWindow(context);
}).catch((error) => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
