import type { SessionSnapshot } from '../model/playback';
import type { StoryDefinition } from '../model/story';
import type { ContentUpdateOptions, ContentUpdateResult, SessionContent } from '../content/types';
import { prepareContent } from '../content/prepare';
import { planContentUpdate, type ContentUpdatePlan } from '../content/update-plan';
import { StoryRunner } from '../story/runner';
import { SessionPlayback } from './playback-driver';
import { SessionStore } from './snapshot-store';
import type { VideoPort } from './video-port';

/** Owns a live graph and media session; content replacement commits before notifying UI. */
export class StorySession {
  private runner: StoryRunner;
  private content: SessionContent;
  private readonly media: SessionPlayback;
  private readonly store: SessionStore;
  private unsubscribeStory: () => void;
  private disposed = false;
  private updating = false;

  constructor(
    story: StoryDefinition, entryNodeId: string, mediaUrls: Readonly<Record<string, string>>,
    video: VideoPort, mediaRevisions?: Readonly<Record<string, string>>,
  ) {
    this.content = prepareContent({ story, entryNodeId, mediaUrls, mediaRevisions });
    this.runner = new StoryRunner(this.content.story, entryNodeId);
    this.store = new SessionStore({ story: this.runner.getSnapshot(), playback: video.getSnapshot() });
    this.media = new SessionPlayback(video, () => this.publish(), (visitId) => (
      !this.updating && !this.disposed && this.runner.completeVideo(visitId)
    ));
    this.unsubscribeStory = this.runner.subscribe(() => this.enterNode(true));
    this.enterNode(false);
  }

  readonly getSnapshot = (): SessionSnapshot => this.store.getSnapshot();
  readonly subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);

  play(): void { if (this.canControlVideo()) void this.media.video.play(); }
  pause(): void { if (this.canChange()) this.media.video.pause(); }
  seek(time: number): void { if (this.canControlVideo()) this.media.video.seek(time); }
  setVolume(volume: number): void { if (this.canChange()) this.media.video.setVolume(volume); }
  replayCurrent(): void { if (this.canControlVideo()) this.enterNode(true); }
  retry(): void { this.replayCurrent(); }
  choose(optionId: string, expectedVisitId: number): boolean {
    return this.canChange() && this.runner.choose(optionId, expectedVisitId);
  }
  restart(): void { if (this.canChange()) this.runner.restart(); }

  applyContent(candidate: SessionContent, options: ContentUpdateOptions): ContentUpdateResult {
    if (!this.canChange()) return { ok: false, error: this.disposed ? '播放会话已销毁。' : '正在应用其他内容。' };
    let plan: ContentUpdatePlan;
    try {
      plan = planContentUpdate(candidate, options, this.content, this.runner.getSnapshot());
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '内容更新失败。' };
    }
    // Session observers cannot see a new graph paired with old content mappings.
    this.updating = true;
    try {
      this.unsubscribeStory();
      this.content = plan.content;
      this.runner = plan.runner;
      this.unsubscribeStory = this.runner.subscribe(() => this.enterNode(true));
      if (plan.preserve) this.media.preserve(this.runner.getSnapshot());
      else this.media.enter(this.runner.getSnapshot(), this.content, false);
    } finally { this.updating = false; }
    this.publish();
    return { ok: true };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeStory();
    this.store.dispose();
    this.media.dispose();
  }

  private canChange(): boolean { return !this.disposed && !this.updating; }
  private canControlVideo(): boolean { return this.canChange() && this.runner.getSnapshot().node.type === 'video'; }

  private enterNode(autoPlay: boolean): void {
    if (this.disposed) return;
    this.media.enter(this.runner.getSnapshot(), this.content, autoPlay);
    this.publish();
  }

  private publish(): void {
    if (!this.canChange()) return;
    this.store.publish({ story: this.runner.getSnapshot(), playback: this.media.getSnapshot() });
  }
}
