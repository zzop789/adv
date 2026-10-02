import { app } from 'electron';
import path from 'node:path';

export function desktopEnvironment() {
  const projectRoot = path.resolve(__dirname, '..');
  const devUrl = !app.isPackaged && __ADV_GAME_SOURCE__ !== null
    && process.env.ADV_DEV_SERVER_URL === 'http://127.0.0.1:5173' ? process.env.ADV_DEV_SERVER_URL : undefined;
  return {
    projectRoot, devUrl,
    hiddenTest: process.env.ADV_SMOKE_TEST === '1',
    gameDirectory: devUrl && __ADV_GAME_SOURCE__ ? __ADV_GAME_SOURCE__ : path.join(projectRoot, 'games', __ADV_GAME_ID__),
    rendererUrl: devUrl ?? 'adv-app://app/index.html',
  };
}
export type DesktopEnvironment = ReturnType<typeof desktopEnvironment>;
