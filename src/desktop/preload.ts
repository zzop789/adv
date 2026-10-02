import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../runtime/types';

const api: DesktopApi = {
  loadGame: () => ipcRenderer.invoke('adv:load-game'),
  releaseGame: (loadId) => ipcRenderer.invoke('adv:release-game', loadId),
  setFullscreen: (value) => ipcRenderer.invoke('adv:set-fullscreen', value),
  getFullscreen: () => ipcRenderer.invoke('adv:get-fullscreen'),
};

contextBridge.exposeInMainWorld('adv', api);
