import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../runtime/types';

const api: DesktopApi = {
  loadGame: () => ipcRenderer.invoke('adv:load-game'),
  setFullscreen: (value) => ipcRenderer.invoke('adv:set-fullscreen', value),
  getFullscreen: () => ipcRenderer.invoke('adv:get-fullscreen'),
};

contextBridge.exposeInMainWorld('adv', api);
