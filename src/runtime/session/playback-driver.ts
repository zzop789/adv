import type { SessionContent } from '../content/types';
import type { PlaybackSnapshot } from '../model/playback';
import type { StorySnapshot } from '../model/story';
import type { VideoPort } from './video-port';

/** Tracks physical playback generations independently from graph visits and content URLs. */
export class SessionPlayback {
  private sourceId = 0;
  private active: { sourceId: number; visitId: number } | null = null;
  private snapshot: PlaybackSnapshot;
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(readonly video: VideoPort, changed: () => void, completed: (visitId: number) => boolean) {
    this.snapshot = video.getSnapshot();
    this.sourceId = this.snapshot.sourceId;
    this.unsubscribe = video.subscribe(() => {
      if (this.disposed) return;
      const snapshot = video.getSnapshot();
      if (snapshot.sourceId !== this.sourceId) return;
      this.snapshot = snapshot;
      if (snapshot.status === 'ended' && this.active && completed(this.active.visitId)) return;
      changed();
    });
  }

  getSnapshot(): PlaybackSnapshot { return this.snapshot; }

  enter(story: StorySnapshot, content: SessionContent, autoPlay: boolean): void {
    if (this.disposed) return;
    if (story.node.type === 'video') {
      const active = { sourceId: ++this.sourceId, visitId: story.visitId };
      this.active = active;
      this.video.load(content.mediaUrls[story.node.mediaId], active.sourceId);
      // A preserve update changes the graph visit, while this physical source and its autoplay remain valid.
      if (autoPlay && this.active?.sourceId === active.sourceId && !this.disposed) void this.video.play();
    } else {
      this.active = null;
      this.video.pause();
    }
  }

  preserve(story: StorySnapshot): void {
    this.active = story.node.type === 'video' ? { sourceId: this.sourceId, visitId: story.visitId } : null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = null;
    this.unsubscribe();
    this.video.dispose();
  }
}
