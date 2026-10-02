import type { UIScreenParams } from '../contracts';
import { UIManager } from '../ui-manager';

export function createPlayerUI() {
  return new UIManager<UIScreenParams>({
    playback: { layer: 'playback' },
    choice: { layer: 'story' },
    ending: { layer: 'story' },
    settings: { layer: 'modal' },
  });
}
