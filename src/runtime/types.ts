export interface GameInfo {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  entryMediaId: string;
}

export interface LoadedGame {
  game: GameInfo;
  entryVideoUrl: string;
}

export type GameLoadResult =
  | { ok: true; value: LoadedGame }
  | { ok: false; error: string };

export interface PlaybackSnapshot {
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

export interface DesktopApi {
  loadGame(): Promise<GameLoadResult>;
  setFullscreen(value: boolean): Promise<boolean>;
  getFullscreen(): Promise<boolean>;
}

declare global {
  interface Window {
    adv: DesktopApi;
  }
}
