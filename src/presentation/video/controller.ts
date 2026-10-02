import type { PlaybackSnapshot } from '../../runtime/types';
import { videoEvents } from './events';
import { finiteVolume, initialSnapshot, playbackError, readTiming } from './values';

/** Owns one persistent video element; UI code only observes its snapshot. */
export class VideoController {
  private snapshot: PlaybackSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly handlers: Record<string, EventListener>;
  private disposed = false;
  private hasSource = false;
  private loadVersion = 0;
  private requestVersion = 0;

  constructor(private readonly video: HTMLVideoElement) {
    this.snapshot = initialSnapshot(video);
    this.handlers = videoEvents(video, {
      active: () => !this.disposed && this.hasSource, disposed: () => this.disposed,
      canReceive: () => this.canReceivePlaybackEvent(), snapshot: () => this.snapshot,
      publish: (patch) => this.publish(patch),
    });
    for (const [event, handler] of Object.entries(this.handlers)) video.addEventListener(event, handler);
  }

  readonly getSnapshot = (): PlaybackSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  load(url: string, sourceId = this.snapshot.sourceId + 1): void {
    if (this.disposed) return;
    const loadVersion = ++this.loadVersion;
    this.requestVersion += 1;
    this.hasSource = false;
    this.video.pause();
    if (!this.isCurrentLoad(loadVersion)) return;
    this.publish({ sourceId, status: 'loading', currentTime: 0, duration: 0, error: null });
    // Observers can synchronously restart or dispose while receiving loading.
    if (!this.isCurrentLoad(loadVersion)) return;
    if (!url.trim()) {
      this.video.removeAttribute('src');
      this.video.load();
      if (this.isCurrentLoad(loadVersion)) this.publish({ status: 'error', error: '请选择有效的视频文件。' });
      return;
    }
    try {
      this.video.src = url;
      if (!this.isCurrentLoad(loadVersion)) return;
      this.hasSource = true;
      this.video.load();
    } catch {
      if (this.isCurrentLoad(loadVersion)) this.publish({ status: 'error', error: '视频加载失败，请重新选择文件。' });
    }
  }

  async play(): Promise<void> {
    if (this.disposed || !this.hasSource) return;
    const requestVersion = ++this.requestVersion;
    this.publish({ status: 'loading', error: null });
    if (!this.isCurrentRequest(requestVersion)) return;
    try {
      await this.video.play();
      if (!this.isCurrentRequest(requestVersion) || this.snapshot.status === 'error') return;
      this.publish({ ...readTiming(this.video), status: this.video.ended ? 'ended'
        : this.video.paused ? 'paused' : this.video.readyState >= 3 ? 'playing' : 'loading' });
    } catch (reason) {
      if (!this.isCurrentRequest(requestVersion) || this.snapshot.status === 'error') return;
      this.publish({ status: 'error', error: playbackError(reason) });
    }
  }

  pause(): void {
    if (this.disposed) return;
    const requestVersion = ++this.requestVersion;
    this.video.pause();
    if (!this.isCurrentRequest(requestVersion) || !this.canReceivePlaybackEvent()) return;
    this.publish({ ...readTiming(this.video), status: this.video.ended ? 'ended' : 'paused' });
  }

  async replay(): Promise<void> {
    if (this.disposed || !this.hasSource) return;
    const loadVersion = this.loadVersion;
    const requestVersion = this.requestVersion;
    this.seek(0);
    if (!this.isCurrentLoad(loadVersion) || !this.isCurrentRequest(requestVersion)) return;
    await this.play();
  }

  seek(time: number): void {
    if (this.disposed || !this.hasSource || !Number.isFinite(time)) return;
    const duration = this.video.duration;
    // Until metadata is available there is no valid finite seek interval.
    if (!Number.isFinite(duration) || duration < 0) return;
    const loadVersion = this.loadVersion;
    const requestVersion = this.requestVersion;
    const target = Math.min(duration, Math.max(0, time));
    this.video.currentTime = target;
    if (!this.isCurrentLoad(loadVersion) || !this.isCurrentRequest(requestVersion)) return;
    this.publish({ ...readTiming(this.video),
      ...(this.snapshot.status === 'ended' && target < duration ? { status: 'paused' as const } : {}) });
  }

  setVolume(volume: number): void {
    if (this.disposed || !Number.isFinite(volume)) return;
    this.video.volume = finiteVolume(volume);
    this.publish({ volume: this.video.volume, muted: this.video.muted });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hasSource = false;
    this.requestVersion += 1;
    for (const [event, handler] of Object.entries(this.handlers)) this.video.removeEventListener(event, handler);
    this.listeners.clear();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }

  private isCurrentRequest(version: number): boolean {
    return !this.disposed && this.hasSource && this.requestVersion === version;
  }
  private isCurrentLoad(version: number): boolean {
    return !this.disposed && this.loadVersion === version;
  }
  private canReceivePlaybackEvent(): boolean {
    return !this.disposed && this.hasSource && this.snapshot.status !== 'error';
  }
  private publish(patch: Partial<PlaybackSnapshot>): void {
    if (this.disposed) return;
    const next = { ...this.snapshot, ...patch };
    const keys = Object.keys(next) as Array<keyof PlaybackSnapshot>;
    if (keys.every((key) => Object.is(next[key], this.snapshot[key]))) return;
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }
}
