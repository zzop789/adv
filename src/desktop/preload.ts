import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../runtime/types';

const api: DesktopApi = {
  ...(__ADV_GAME_SOURCE__ !== null ? { authoring: {
    read: () => ipcRenderer.invoke('adv:authoring:read'),
    validate: (story: unknown) => ipcRenderer.invoke('adv:authoring:validate', story),
    save: (request: { story: unknown; expectedRevision: string }) => ipcRenderer.invoke('adv:authoring:save', request),
    preview: (story: unknown) => ipcRenderer.invoke('adv:authoring:preview', story),
  } } : {}),
  loadGame: () => ipcRenderer.invoke('adv:load-game'),
  releaseGame: (loadId) => ipcRenderer.invoke('adv:release-game', loadId),
  setFullscreen: (value) => ipcRenderer.invoke('adv:set-fullscreen', value),
  getFullscreen: () => ipcRenderer.invoke('adv:get-fullscreen'),
};

contextBridge.exposeInMainWorld('adv', api);
