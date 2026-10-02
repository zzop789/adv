import { ipcMain } from 'electron';
import type { DesktopContext } from '../app/context';
import { verifySender } from '../security/sender';

export function registerWindowHandlers(context: DesktopContext): void {
  ipcMain.handle('adv:set-fullscreen', (event, value: unknown) => {
    const owner = verifySender(context, event);
    if (typeof value !== 'boolean') throw new Error('全屏参数不正确。');
    owner.setFullScreen(value);
    return value;
  });
  ipcMain.handle('adv:get-fullscreen', (event) => verifySender(context, event).isFullScreen());
}
