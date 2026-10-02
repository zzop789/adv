import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { AuthoringResult } from '../../authoring/contracts';
import { AuthoringService } from '../authoring/service';
import type { DesktopContext } from '../app/context';
import { verifySender } from '../security/sender';
import { loadCandidate } from './content';

async function result<T>(operation: () => Promise<T>): Promise<AuthoringResult<T>> {
  try { return { ok: true, value: await operation() }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : '制作操作失败。' }; }
}

export function registerAuthoringHandlers(context: DesktopContext): void {
  if (!context.config.devUrl) return;
  const service = new AuthoringService(context.config.gameDirectory, __ADV_GAME_ID__);
  function check(event: IpcMainInvokeEvent) { verifySender(context, event); }
  ipcMain.handle('adv:authoring:read', (event) => result(async () => { check(event); return service.read(); }));
  ipcMain.handle('adv:authoring:validate', (event, story: unknown) => result(async () => { check(event); return service.validate(story); }));
  ipcMain.handle('adv:authoring:save', (event, request) => result(async () => { check(event); return service.save(request); }));
  ipcMain.handle('adv:authoring:preview', (event, story: unknown) => loadCandidate(context, event, { story }));
}
