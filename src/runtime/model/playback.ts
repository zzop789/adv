import type { StorySnapshot } from './story';

export interface PlaybackSnapshot {
  sourceId: number;
  status: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  error: string | null;
}

export interface PlaybackActions {
  play(): void;
  pause(): void;
  replay(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  toggleFullscreen(): void;
  retry(): void;
}

export interface SessionSnapshot { story: StorySnapshot; playback: PlaybackSnapshot }
