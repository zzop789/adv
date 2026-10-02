import type { StorySession } from '../../runtime/session';
import type { PlaybackActions } from '../../runtime/types';
import type { UIScreenParams } from '../contracts';
import type { UIManager } from '../ui-manager';

export type PlayerSession = Pick<StorySession,
  'getSnapshot' | 'subscribe' | 'play' | 'pause' | 'choose' | 'restart' | 'setVolume'>;
export type PlayerActions = PlaybackActions & { togglePlayback(): void };
export type PlayerUIManager = UIManager<UIScreenParams>;
