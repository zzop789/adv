import type { SessionSnapshot } from '../model/playback';

/** Coalesces reentrant notifications; observers only read fully committed session snapshots. */
export class SessionStore {
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private notifying = false;
  private pending = false;

  constructor(private snapshot: SessionSnapshot) {}
  readonly getSnapshot = (): SessionSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  publish(snapshot: SessionSnapshot): void {
    if (this.disposed || (this.snapshot.story === snapshot.story && this.snapshot.playback === snapshot.playback)) return;
    this.snapshot = Object.freeze(snapshot);
    this.pending = true;
    if (this.notifying) return;
    this.notifying = true;
    try {
      while (this.pending && !this.disposed) {
        this.pending = false;
        for (const listener of [...this.listeners]) {
          if (!this.listeners.has(listener)) continue;
          try { listener(); }
          catch (error) {
            // A notification failure cannot turn an already committed content update into a failed install.
            console.error('播放会话订阅器执行失败。', error);
          }
        }
      }
    } finally { this.notifying = false; }
  }

  dispose(): void { this.disposed = true; this.listeners.clear(); }
}
