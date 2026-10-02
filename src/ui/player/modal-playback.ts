import type { SessionSnapshot } from '../../runtime/types';
import type { PlayerSession, PlayerUIManager } from './types';

/** A preserved physical source keeps its resume intent despite graph visit changes. */
export class ModalPlayback {
  private blocked = false;
  private resumeSource: number | null = null;
  private disposed = false;

  constructor(private readonly ui: PlayerUIManager, private readonly session: PlayerSession) {}

  readonly sync = (): void => {
    if (this.disposed) return;
    const blocked = this.ui.getSnapshot().entries.some((entry) => entry.layer === 'modal');
    if (blocked === this.blocked) return;
    this.blocked = blocked;
    const { story, playback } = this.session.getSnapshot();
    if (blocked) {
      if (story.node.type === 'video' && ['playing', 'loading'].includes(playback.status)) {
        this.resumeSource = playback.sourceId;
        this.session.pause();
      }
      return;
    }
    const previous = this.resumeSource;
    this.resumeSource = null;
    if (previous !== null && playback.sourceId === previous
      && story.node.type === 'video' && playback.status === 'paused') this.session.play();
  };

  /** Returns true when pausing creates a fresh snapshot that needs another reconciliation. */
  reconcile({ story, playback }: SessionSnapshot): boolean {
    if (this.disposed || !this.blocked) return false;
    if (this.resumeSource !== null && (this.resumeSource !== playback.sourceId
      || story.node.type !== 'video' || playback.status === 'error')) this.resumeSource = null;
    if (story.node.type === 'video' && ['playing', 'loading'].includes(playback.status)) {
      this.session.pause();
      return true;
    }
    return false;
  }

  dispose(): void {
    this.disposed = true;
    this.resumeSource = null;
  }
}
