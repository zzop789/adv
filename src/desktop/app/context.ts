import type { BrowserWindow } from 'electron';
import type { DesktopEnvironment } from './environment';
import { ContentRegistry } from '../content/registry';

export interface DesktopContext {
  config: DesktopEnvironment;
  window: BrowserWindow | null;
  generation: number;
  iconInitialized: boolean;
  contents: ContentRegistry;
}
export function createDesktopContext(config: DesktopEnvironment): DesktopContext {
  return { config, window: null, generation: 0, iconInitialized: false, contents: new ContentRegistry() };
}
