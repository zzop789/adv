import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { GameLoadResult } from '../../runtime/types';
import type { DesktopContext } from '../app/context';
import { loadGameContent, type ContentLoadOptions } from '../content/loader';
import { resolveContentFile } from '../content/paths';
import { verifySender } from '../security/sender';

export async function loadCandidate(context: DesktopContext, event: IpcMainInvokeEvent, options?: ContentLoadOptions): Promise<GameLoadResult> {
  const owner = verifySender(context, event);
  const generation = context.generation;
  try {
    const content = await loadGameContent(context.config.gameDirectory, {
      ...options, fingerprints: Boolean(context.config.devUrl),
    });
    if (content.game.id !== __ADV_GAME_ID__) throw new Error('作品 ID 与构建目标不一致，请重新构建。');
    const icon = await resolveContentFile(content.root, content.build.icon);
    if (generation !== context.generation || owner.isDestroyed()) throw new Error('预览页面已关闭或刷新，本次内容加载已取消。');
    if (!context.iconInitialized) { owner.setIcon(icon); context.iconInitialized = true; }
    // The accepted renderer updates document.title; staging a candidate has no title side effect.
    return { ok: true, value: context.contents.register(content, Boolean(context.config.devUrl)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '作品内容无法读取。' };
  }
}

export function registerContentHandlers(context: DesktopContext): void {
  ipcMain.handle('adv:load-game', (event) => loadCandidate(context, event));
  ipcMain.handle('adv:release-game', (event, loadId: unknown) => {
    verifySender(context, event);
    if (typeof loadId !== 'string') throw new Error('内容加载标识不正确。');
    context.contents.release(loadId);
  });
}
