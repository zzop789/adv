import type { PlaybackSnapshot } from '../model/playback';

/** Media failures are reported as snapshots; operations must not throw. */
export interface VideoPort {
  getSnapshot(): PlaybackSnapshot;
  subscribe(listener: () => void): () => void;
  load(url: string, sourceId: number): void;
  play(): void | Promise<void>;
  pause(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  dispose(): void;
}
