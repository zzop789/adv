import type { PlaybackSnapshot } from '../runtime/types';

type Listener = () => void;

function finiteVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function playbackError(reason: unknown): string {
  const name = typeof reason === 'object' && reason !== null && 'name' in reason
    ? reason.name
    : '';

  if (name === 'NotAllowedError') {
    return '播放被阻止，请点击播放按钮重试。';
  }
  if (name === 'NotSupportedError') {
    return '无法播放此视频，请检查文件是否损坏或格式是否受支持。';
  }
  if (name === 'AbortError') {
    return '视频播放已中断，请重试。';
  }
  return '视频播放失败，请重试或更换视频文件。';
}

/** Owns one persistent video element; UI code only observes its snapshot. */
export class VideoController {
  private snapshot: PlaybackSnapshot;
  private readonly listeners = new Set<Listener>();
  private disposed = false;
  private hasSource = false;
  private loadVersion = 0;
  private requestVersion = 0;

  private readonly handlers: Record<string, EventListener> = {
    loadedmetadata: () => this.syncTiming(),
    durationchange: () => this.syncTiming(),
    timeupdate: () => this.syncTiming(),
    canplay: () => {
      if (!this.canReceivePlaybackEvent()) return;
      this.publish({
        ...this.timing(),
        status: this.video.ended
          ? 'ended'
          : !this.video.paused
            ? 'playing'
            : this.snapshot.status === 'paused' ? 'paused' : 'ready',
      });
    },
    playing: () => {
      if (!this.canReceivePlaybackEvent() || this.video.paused) return;
      this.publish({ ...this.timing(), status: 'playing', error: null });
    },
    waiting: () => {
      if (!this.canReceivePlaybackEvent() || this.video.paused) return;
      this.publish({ ...this.timing(), status: 'loading' });
    },
    pause: () => {
      if (!this.canReceivePlaybackEvent() || !this.video.paused) return;
      // load() can queue a pause event from the previous source.
      if (this.snapshot.status === 'loading' && this.video.readyState === 0) return;
      this.publish({
        ...this.timing(),
        status: this.video.ended ? 'ended' : 'paused',
      });
    },
    ended: () => {
      if (!this.canReceivePlaybackEvent() || !this.video.ended) return;
      this.publish({ ...this.timing(), status: 'ended' });
    },
    error: () => {
      if (!this.hasSource || this.disposed) return;
      const mediaError = this.video.error;
      // A queued error from a replaced source no longer has a MediaError.
      if (!mediaError) return;
      const messages: Record<number, string> = {
        1: '视频加载已中断，请重新选择文件或重试。',
        2: '无法读取视频，请检查文件是否仍然存在，然后重试。',
        3: '视频解码失败，请更换可播放的视频文件。',
        4: '不支持此视频格式或文件无法访问，请更换文件后重试。',
      };
      this.publish({
        status: 'error',
        error: messages[mediaError.code] ?? '视频加载失败，请重新选择文件。',
      });
    },
    volumechange: () => {
      if (this.disposed) return;
      this.publish({ volume: finiteVolume(this.video.volume), muted: this.video.muted });
    },
  };

  constructor(private readonly video: HTMLVideoElement) {
    this.snapshot = {
      sourceId: 0,
      status: 'idle',
      currentTime: 0,
      duration: 0,
      volume: finiteVolume(video.volume),
      muted: video.muted,
      error: null,
    };
    for (const [event, handler] of Object.entries(this.handlers)) {
      video.addEventListener(event, handler);
    }
  }

  readonly getSnapshot = (): PlaybackSnapshot => this.snapshot;

  readonly subscribe = (listener: Listener): (() => void) => {
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
    // A loading observer may cancel playback before the native play call starts.
    if (!this.isCurrentRequest(requestVersion)) return;

    try {
      await this.video.play();
      if (!this.isCurrentRequest(requestVersion)) return;
      // A media error event may already have supplied a more useful message.
      if (this.snapshot.status === 'error') return;
      this.publish({
        ...this.timing(),
        status: this.video.ended
          ? 'ended'
          : this.video.paused
            ? 'paused'
            : this.video.readyState >= 3 ? 'playing' : 'loading',
      });
    } catch (reason) {
      if (!this.isCurrentRequest(requestVersion) || this.snapshot.status === 'error') return;
      this.publish({ status: 'error', error: playbackError(reason) });
    }
  }

  pause(): void {
    if (this.disposed) return;
    const requestVersion = ++this.requestVersion;
    this.video.pause();
    if (!this.isCurrentRequest(requestVersion)) return;
    if (!this.canReceivePlaybackEvent()) return;
    this.publish({ ...this.timing(), status: this.video.ended ? 'ended' : 'paused' });
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
    this.publish({
      ...this.timing(),
      ...(this.snapshot.status === 'ended' && target < duration ? { status: 'paused' as const } : {}),
    });
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
    for (const [event, handler] of Object.entries(this.handlers)) {
      this.video.removeEventListener(event, handler);
    }
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

  private timing(): Pick<PlaybackSnapshot, 'currentTime' | 'duration'> {
    const duration = Number.isFinite(this.video.duration) && this.video.duration >= 0
      ? this.video.duration
      : 0;
    const currentTime = Number.isFinite(this.video.currentTime)
      ? Math.max(0, this.video.currentTime)
      : 0;
    return { duration, currentTime: duration > 0 ? Math.min(duration, currentTime) : currentTime };
  }

  private syncTiming(): void {
    if (this.disposed || !this.hasSource) return;
    this.publish(this.timing());
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
