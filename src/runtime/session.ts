import { StoryRunner } from './story-runner';
import { validateStory } from './story-schema';
import type { PlaybackSnapshot, SessionSnapshot, StoryDefinition } from './types';

type Listener = () => void;

/** A port reports media errors through its snapshot and settles play without throwing. */
export interface VideoPort {
  getSnapshot(): PlaybackSnapshot;
  subscribe(listener: Listener): () => void;
  load(url: string, sourceId: number): void;
  play(): void | Promise<void>;
  pause(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  dispose(): void;
}

/** A session survives UI rerenders and coordinates story state with one media player. */
export class StorySession {
  private readonly runner: StoryRunner;
  private readonly listeners = new Set<Listener>();
  private readonly unsubscribeStory: () => void;
  private readonly unsubscribePlayback: () => void;
  private snapshot: SessionSnapshot;
  private sourceId = 0;
  private activeVideo: { sourceId: number; visitId: number } | null = null;
  private disposed = false;

  constructor(
    story: StoryDefinition,
    entryNodeId: string,
    private readonly mediaUrls: Readonly<Record<string, string>>,
    private readonly video: VideoPort,
  ) {
    validateStory(story, entryNodeId, new Set(Object.entries(mediaUrls).filter(([, url]) => url.trim()).map(([id]) => id)));
    this.runner = new StoryRunner(story, entryNodeId);
    this.snapshot = { story: this.runner.getSnapshot(), playback: video.getSnapshot() };
    this.unsubscribeStory = this.runner.subscribe(() => this.enterNode(true));
    this.unsubscribePlayback = video.subscribe(this.onPlaybackChanged);
    // The first screen waits for an explicit play action; subsequent scenes auto-play.
    this.enterNode(false);
  }

  readonly getSnapshot = (): SessionSnapshot => this.snapshot;

  readonly subscribe = (listener: Listener): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  play(): void {
    if (!this.disposed && this.runner.getSnapshot().node.type === 'video') void this.video.play();
  }

  pause(): void {
    if (!this.disposed) this.video.pause();
  }

  replayCurrent(): void {
    if (!this.disposed && this.runner.getSnapshot().node.type === 'video') this.enterNode(true);
  }

  seek(time: number): void {
    if (!this.disposed && this.runner.getSnapshot().node.type === 'video') this.video.seek(time);
  }

  setVolume(volume: number): void {
    if (!this.disposed) this.video.setVolume(volume);
  }

  retry(): void {
    this.replayCurrent();
  }

  choose(optionId: string, expectedVisitId: number): boolean {
    return !this.disposed && this.runner.choose(optionId, expectedVisitId);
  }

  restart(): void {
    if (!this.disposed) this.runner.restart();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.activeVideo = null;
    this.unsubscribeStory();
    this.unsubscribePlayback();
    this.listeners.clear();
    this.video.dispose();
  }

  private enterNode(autoPlay: boolean): void {
    if (this.disposed) return;
    const story = this.runner.getSnapshot();
    if (story.node.type === 'video') {
      const activeVideo = { sourceId: ++this.sourceId, visitId: story.visitId };
      this.activeVideo = activeVideo;
      this.video.load(this.mediaUrls[story.node.mediaId], activeVideo.sourceId);
      if (autoPlay && this.activeVideo === activeVideo && !this.disposed) void this.video.play();
    } else {
      // Keep the last frame under choices/endings, and invalidate all video completions.
      this.activeVideo = null;
      this.video.pause();
    }
    this.publish();
  }

  private readonly onPlaybackChanged = (): void => {
    if (this.disposed) return;
    const playback = this.video.getSnapshot();
    // A replaced source (including a retry of the same node) cannot affect this visit.
    if (playback.sourceId !== this.sourceId) return;
    const active = this.activeVideo;
    if (playback.status === 'ended' && active?.sourceId === playback.sourceId) {
      if (this.runner.completeVideo(active.visitId)) return;
    }
    this.publish();
  };

  private publish(): void {
    if (this.disposed) return;
    const story = this.runner.getSnapshot();
    const currentPlayback = this.video.getSnapshot();
    const playback = currentPlayback.sourceId === this.sourceId ? currentPlayback : this.snapshot.playback;
    if (this.snapshot.story === story && this.snapshot.playback === playback) return;
    this.snapshot = { story, playback };
    for (const listener of [...this.listeners]) listener();
  }
}
