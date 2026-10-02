import type { ContentUpdateOptions, ContentUpdateResult, GameLoadResult, LoadedGame } from '../../runtime/types';

interface PreviewApi {
  loadGame(): Promise<GameLoadResult>;
  releaseGame(loadId: string): Promise<void>;
}

export interface PreviewSnapshot {
  content: LoadedGame | null;
  loading: boolean;
  error: string | null;
}

/** Owns loaded content until a Player mounts it; mounted Players release after teardown. */
export class PreviewController {
  private snapshot: PreviewSnapshot = { content: null, loading: true, error: null };
  private readonly listeners = new Set<() => void>();
  private readonly versions = new Map<string, 'pending' | 'mounted'>();
  private disposed = false;
  private inFlight = false;
  private request = 0;
  private installer: ((content: LoadedGame, options: ContentUpdateOptions) => ContentUpdateResult) | null = null;

  constructor(private readonly api: PreviewApi) {}

  readonly getSnapshot = (): PreviewSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  setInstaller(installer: NonNullable<PreviewController['installer']>): () => void {
    this.installer = installer;
    return () => { if (this.installer === installer) this.installer = null; };
  }

  async load(options: ContentUpdateOptions = { strategy: 'restart' }, source = () => this.api.loadGame()): Promise<boolean> {
    if (this.disposed || this.inFlight) return false;
    this.inFlight = true;
    const request = ++this.request;
    this.publish({ ...this.snapshot, loading: true, error: null });
    try {
      const result = await source();
      if (!result.ok) throw new Error(result.error);
      if (this.disposed || request !== this.request) {
        this.release(result.value.loadId);
        return false;
      }
      this.versions.set(result.value.loadId, 'pending');
      if (this.installer) {
        let applied: ContentUpdateResult;
        try {
          applied = this.installer(result.value, options);
        } catch (error) {
          this.release(result.value.loadId);
          throw error;
        }
        if (!applied.ok) {
          this.release(result.value.loadId);
          throw new Error(applied.error);
        }
      }
      // Session observers can synchronously tear down the owner during install.
      if (this.disposed || request !== this.request) {
        if (this.versions.get(result.value.loadId) === 'pending') this.release(result.value.loadId);
        return false;
      }
      // A successful candidate can be superseded before React commits its Player.
      const previous = this.snapshot.content?.loadId;
      if (previous && this.versions.get(previous) === 'pending') this.release(previous);
      this.publish({ content: result.value, loading: false, error: null });
      return true;
    } catch (error) {
      if (!this.disposed && request === this.request) {
        this.publish({ ...this.snapshot, loading: false, error: error instanceof Error ? error.message : '无法读取作品。' });
      }
      return false;
    } finally {
      this.inFlight = false;
    }
  }

  /** Called once the Player has mounted its persistent video host. */
  mount(loadId: string): void {
    if (this.versions.has(loadId)) this.versions.set(loadId, 'mounted');
  }

  /** The caller must dispose the session and detach video before calling this. */
  unmount(loadId: string): void {
    if (this.versions.has(loadId)) this.release(loadId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.request += 1;
    this.listeners.clear();
    for (const [loadId, phase] of this.versions) {
      if (phase === 'pending') this.release(loadId);
    }
    // Mounted versions belong to Player cleanup, which can run after App cleanup.
  }

  private release(loadId: string): void {
    this.versions.delete(loadId);
    void this.api.releaseGame(loadId).catch((error) => console.error('释放预览内容失败', error));
  }

  private publish(snapshot: PreviewSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of [...this.listeners]) {
      try { listener(); }
      catch (error) { console.error('预览状态订阅器异常', error); }
    }
  }
}
