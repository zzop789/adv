import assert from 'node:assert/strict';
import test from 'node:test';
import { VideoController } from '../src/presentation/video-controller';
import { StorySession, type VideoPort } from '../src/runtime/session';
import type { PlaybackSnapshot, StoryDefinition } from '../src/runtime/types';

class FakeVideoPort implements VideoPort {
  snapshot: PlaybackSnapshot = {
    sourceId: 0, status: 'idle', currentTime: 0, duration: 0, volume: 1, muted: false, error: null,
  };
  readonly listeners = new Set<() => void>();
  readonly loads: Array<{ url: string; sourceId: number }> = [];
  plays = 0;
  pauses = 0;
  seeks = 0;
  disposals = 0;

  getSnapshot(): PlaybackSnapshot { return this.snapshot; }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  load(url: string, sourceId: number): void {
    this.loads.push({ url, sourceId });
    this.emit({ sourceId, status: 'loading', currentTime: 0, duration: 0, error: null });
  }
  play(): void {
    this.plays += 1;
    this.emit({ status: 'playing' });
  }
  pause(): void {
    this.pauses += 1;
    if (this.snapshot.status !== 'ended' && this.snapshot.status !== 'idle') this.emit({ status: 'paused' });
  }
  seek(time: number): void {
    this.seeks += 1;
    this.emit({ currentTime: time });
  }
  setVolume(volume: number): void { this.emit({ volume }); }
  dispose(): void { this.disposals += 1; }
  emit(patch: Partial<PlaybackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}

function setup() {
  const story: StoryDefinition = {
    schemaVersion: 1,
    nodes: [
      { id: 'intro', type: 'video', mediaId: 'intro', next: 'choice' },
      { id: 'choice', type: 'choice', prompt: '前进？', options: [
        { id: 'forward', label: '前进', next: 'branch' },
        { id: 'leave', label: '离开', next: 'end' },
      ] },
      { id: 'branch', type: 'video', mediaId: 'branch', next: 'end' },
      { id: 'end', type: 'end', title: '结束', description: '' },
    ],
  };
  const video = new FakeVideoPort();
  const session = new StorySession(story, 'intro', {
    intro: 'adv-media://demo/intro', branch: 'adv-media://demo/branch',
  }, video);
  return { session, video, story };
}

test('session loads the entry, keeps the final frame for choices, and auto-plays the selected branch', () => {
  const { session, video } = setup();
  assert.equal(video.loads[0].url, 'adv-media://demo/intro');
  assert.equal(video.plays, 0);
  session.play();
  assert.equal(video.plays, 1);
  video.emit({ status: 'ended', currentTime: 12, duration: 12 });
  const choice = session.getSnapshot();
  assert.equal(choice.story.node.id, 'choice');
  assert.equal(choice.playback.currentTime, 12);
  assert.equal(video.loads.length, 1);
  assert.equal(session.choose('forward', choice.story.visitId), true);
  assert.equal(session.choose('leave', choice.story.visitId), false);
  assert.equal(video.loads.at(-1)?.url, 'adv-media://demo/branch');
  assert.equal(video.plays, 2);
  video.emit({ status: 'ended', currentTime: 7, duration: 7 });
  assert.equal(session.getSnapshot().story.node.id, 'end');
  assert.equal(video.loads.length, 2);
  assert.equal(session.getSnapshot().playback.currentTime, 7);
  session.dispose();
});

test('stale source completions and errors never advance or overwrite a replacement video', () => {
  const { session, video } = setup();
  const oldSourceId = video.getSnapshot().sourceId;
  video.emit({ status: 'ended' });
  session.choose('forward', session.getSnapshot().story.visitId);
  const replacement = session.getSnapshot();
  const replacementSourceId = replacement.playback.sourceId;
  video.emit({ sourceId: oldSourceId, status: 'ended' });
  assert.equal(session.getSnapshot(), replacement);
  video.emit({ sourceId: oldSourceId, status: 'error', error: 'late failure' });
  assert.equal(session.getSnapshot(), replacement);
  video.emit({ sourceId: replacementSourceId, status: 'ended', error: null });
  assert.equal(session.getSnapshot().story.node.id, 'end');
  session.dispose();
});

test('media errors remain on the current node and retry creates a new playback generation', () => {
  const { session, video } = setup();
  const visitId = session.getSnapshot().story.visitId;
  const oldSourceId = video.getSnapshot().sourceId;
  video.emit({ status: 'error', error: 'decode failed' });
  assert.equal(session.getSnapshot().story.node.id, 'intro');
  assert.equal(session.getSnapshot().playback.error, 'decode failed');
  session.retry();
  const newSourceId = video.getSnapshot().sourceId;
  assert.ok(newSourceId > oldSourceId);
  assert.equal(session.getSnapshot().story.visitId, visitId);
  assert.equal(session.getSnapshot().playback.error, null);
  video.emit({ sourceId: oldSourceId, status: 'ended' });
  assert.equal(session.getSnapshot().story.node.id, 'intro');
  video.emit({ sourceId: newSourceId, status: 'ended' });
  assert.equal(session.getSnapshot().story.node.id, 'choice');
  session.dispose();
});

test('restart invalidates old choices and pending playback from the previous run', () => {
  const { session, video } = setup();
  video.emit({ status: 'ended' });
  const choice = session.getSnapshot().story;
  const oldSourceId = video.getSnapshot().sourceId;
  session.restart();
  const newSourceId = video.getSnapshot().sourceId;
  assert.equal(session.getSnapshot().story.node.id, 'intro');
  assert.equal(session.getSnapshot().story.runId, 2);
  assert.equal(video.plays, 1);
  video.emit({ sourceId: oldSourceId, status: 'ended' });
  assert.equal(session.getSnapshot().story.node.id, 'intro');
  video.emit({ sourceId: newSourceId, status: 'ended' });
  assert.equal(session.choose('forward', choice.visitId), false);
  assert.equal(session.getSnapshot().story.node.id, 'choice');
  session.dispose();
});

test('pause and seek only affect media while choices preserve the held frame', () => {
  const { session, video } = setup();
  session.play();
  session.seek(4);
  session.pause();
  assert.equal(session.getSnapshot().playback.status, 'paused');
  assert.equal(session.getSnapshot().playback.currentTime, 4);
  assert.equal(session.getSnapshot().story.node.id, 'intro');
  video.emit({ status: 'ended', currentTime: 12 });
  const loadCount = video.loads.length;
  const playCount = video.plays;
  const seekCount = video.seeks;
  session.play();
  session.seek(0);
  session.replayCurrent();
  session.retry();
  assert.equal(video.loads.length, loadCount);
  assert.equal(video.plays, playCount);
  assert.equal(video.seeks, seekCount);
  session.setVolume(0.25);
  assert.equal(session.getSnapshot().playback.volume, 0.25);
  assert.equal(session.getSnapshot().playback.currentTime, 12);
  session.dispose();
});

test('disposing a session unsubscribes and makes late media callbacks and UI actions harmless', () => {
  const { session, video } = setup();
  let notifications = 0;
  session.subscribe(() => { notifications += 1; });
  const snapshot = session.getSnapshot();
  session.dispose();
  session.dispose();
  assert.equal(video.disposals, 1);
  assert.equal(video.listeners.size, 0);
  video.emit({ status: 'ended' });
  session.restart();
  session.replayCurrent();
  session.play();
  session.pause();
  session.seek(8);
  session.setVolume(0);
  assert.equal(session.choose('forward', snapshot.story.visitId), false);
  assert.equal(session.getSnapshot(), snapshot);
  assert.equal(notifications, 0);
  assert.equal(video.loads.length, 1);
  assert.equal(video.plays, 0);
});

test('session refuses missing media mappings before touching the player', () => {
  const { session, story } = setup();
  const video = new FakeVideoPort();
  assert.throws(() => new StorySession(story, 'intro', { intro: ' ' }, video), /不存在的视频素材/);
  assert.equal(video.loads.length, 0);
  session.dispose();
});

class MediaElement extends EventTarget {
    src = '';
    paused = true;
    ended = false;
    readyState = 0;
    currentTime = 0;
    duration = Number.NaN;
    volume = 1;
    muted = false;
    error: { code: number } | null = null;
    playResult: () => Promise<void> = () => Promise.resolve();
    play(): Promise<void> { this.paused = false; return this.playResult(); }
    pause(): void { this.paused = true; }
    load(): void {
      this.paused = true;
      this.ended = false;
      this.currentTime = 0;
      this.duration = Number.NaN;
      this.readyState = 0;
      this.error = null;
    }
    removeAttribute(): void { this.src = ''; }
    ready(): void {
      this.readyState = 4;
      this.duration = 5;
      this.dispatchEvent(new Event('canplay'));
    }
}

test('session and actual controller reject an old play promise and delayed ended after a scene switch', async () => {
  const video = new MediaElement();
  const session = new StorySession({ schemaVersion: 1, nodes: [
    { id: 'a', type: 'video', mediaId: 'a', next: 'b' },
    { id: 'b', type: 'video', mediaId: 'b', next: 'end' },
    { id: 'end', type: 'end', title: '结束', description: '' },
  ] }, 'a', { a: 'adv-media://demo/a', b: 'adv-media://demo/b' }, new VideoController(video as unknown as HTMLVideoElement));
  let rejectOld!: (error: unknown) => void;
  video.playResult = () => new Promise<void>((_resolve, reject) => { rejectOld = reject; });
  video.ready();
  session.play();
  video.playResult = () => Promise.resolve();
  video.ended = true;
  video.paused = true;
  video.dispatchEvent(new Event('ended'));
  assert.equal(video.src, 'adv-media://demo/b');
  assert.equal(session.getSnapshot().story.node.id, 'b');
  video.ready();
  await Promise.resolve();
  const nextScene = session.getSnapshot();
  assert.equal(nextScene.playback.status, 'playing');
  rejectOld({ name: 'NotSupportedError' });
  await Promise.resolve();
  video.dispatchEvent(new Event('ended'));
  assert.equal(session.getSnapshot(), nextScene);
  video.ended = true;
  video.paused = true;
  video.dispatchEvent(new Event('ended'));
  assert.equal(session.getSnapshot().story.node.id, 'end');
  session.dispose();
});

test('restarting synchronously while the next scene loads leaves the entry story and source aligned', async () => {
  const video = new MediaElement();
  const session = new StorySession({ schemaVersion: 1, nodes: [
    { id: 'a', type: 'video', mediaId: 'a', next: 'b' },
    { id: 'b', type: 'video', mediaId: 'b', next: 'end' },
    { id: 'end', type: 'end', title: '结束', description: '' },
  ] }, 'a', { a: 'adv-media://demo/a', b: 'adv-media://demo/b' }, new VideoController(video as unknown as HTMLVideoElement));
  let restarted = false;
  session.subscribe(() => {
    const snapshot = session.getSnapshot();
    if (!restarted && snapshot.story.node.id === 'b' && snapshot.playback.status === 'loading') {
      restarted = true;
      session.restart();
    }
  });
  video.ready();
  video.ended = true;
  video.dispatchEvent(new Event('ended'));
  video.ready();
  await Promise.resolve();
  assert.equal(session.getSnapshot().story.node.id, 'a');
  assert.equal(session.getSnapshot().story.runId, 2);
  assert.equal(video.src, 'adv-media://demo/a');
  assert.equal(session.getSnapshot().playback.status, 'playing');
  session.dispose();
});

test('choice and ending entry nodes do not require a video source', () => {
  const video = new FakeVideoPort();
  const session = new StorySession({ schemaVersion: 1, nodes: [
    { id: 'choice', type: 'choice', prompt: '继续？', options: [{ id: 'done', label: '结束', next: 'end' }] },
    { id: 'end', type: 'end', title: '结束', description: '' },
  ] }, 'choice', {}, video);
  assert.equal(session.getSnapshot().story.node.id, 'choice');
  assert.equal(video.loads.length, 0);
  assert.equal(session.choose('done', session.getSnapshot().story.visitId), true);
  assert.equal(session.getSnapshot().story.node.id, 'end');
  session.restart();
  assert.equal(session.getSnapshot().story.node.id, 'choice');
  session.dispose();

  const endingVideo = new FakeVideoPort();
  const ending = new StorySession({ schemaVersion: 1, nodes: [
    { id: 'end', type: 'end', title: '结束', description: '' },
  ] }, 'end', {}, endingVideo);
  assert.equal(ending.getSnapshot().story.node.type, 'end');
  assert.equal(endingVideo.loads.length, 0);
  ending.dispose();
});
