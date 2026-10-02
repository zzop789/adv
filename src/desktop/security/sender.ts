import type { IpcMainInvokeEvent } from 'electron';
import type { DesktopContext } from '../app/context';

export function verifySender(context: DesktopContext, event: IpcMainInvokeEvent) {
  const owner = context.window;
  if (!owner || event.sender !== owner.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('不支持的调用来源。');
  }
  const source = event.senderFrame.url;
  const { devUrl, rendererUrl } = context.config;
  if (devUrl ? new URL(source).origin !== devUrl : source !== rendererUrl) throw new Error('不支持的页面。');
  return owner;
}
