import assert from 'node:assert/strict';
import test from 'node:test';
import { VideoController } from '../src/presentation/video-controller';

class FakeVideo extends EventTarget {
  src = '';
  paused = true;
  ended = false;
  readyState = 0;
  duration = Number.NaN;
  volume = 1;
  muted = false;
  error: { code: number } | null = null;
  private position = 0;
  playResult: () => Promise<void> = () => Promise.resolve();

  get currentTime(): number { return this.position; }
  set currentTime(value: number) {
    this.position = value;
    this.ended = false;
  }

  play(): Promise<void> {
    this.paused = false;
    return this.playResult();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.emit('pause');
  }

  load(): void {
    this.paused = true;
    this.ended = false;
    this.readyState = 0;
    this.duration = Number.NaN;
    this.currentTime = 0;
    this.error = null;
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }

  emit(event: string): void { this.dispatchEvent(new Event(event)); }

  ready(duration = 30): void {
    this.duration = duration;
    this.readyState = 1;
    this.emit('loadedmetadata');
    this.readyState = 4;
    this.emit('canplay');
  }
}

function setup() {
  const video = new FakeVideo();
  const controller = new VideoController(video as unknown as HTMLVideoElement);
  controller.load('adv-media://demo/intro.mp4');
  return { video, controller };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('play rejection is readable and never advances the player as ended', async () => {
  const { video, controller } = setup();
  video.ready();
  video.playResult = () => Promise.reject({ name: 'NotAllowedError' });

  await assert.doesNotReject(controller.play());
  assert.equal(controller.getSnapshot().status, 'error');
  assert.match(controller.getSnapshot().error ?? '', /点击播放按钮重试/);

  video.ended = true;
  video.emit('ended');
  video.emit('canplay');
  assert.equal(controller.getSnapshot().status, 'error');
  controller.dispose();
});

test('switching source discards a previous asynchronous play rejection', async () => {
  const { video, controller } = setup();
  video.ready();
  const pending = deferred();
  video.playResult = () => pending.promise;
  const playback = controller.play();

  controller.load('adv-media://demo/replacement.mp4');
  video.ready(12);
  const replacementSnapshot = controller.getSnapshot();
  pending.reject({ name: 'NotSupportedError' });
  await playback;

  assert.equal(controller.getSnapshot(), replacementSnapshot);
  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(controller.getSnapshot().duration, 12);
  controller.dispose();
});

test('queued pause and ended events from an old source cannot interrupt the new playing clip', async () => {
  const { video, controller } = setup();
  video.ready();
  await controller.play();
  controller.load('adv-media://asset/new', 12);
  video.ready();
  await controller.play();
  const snapshot = controller.getSnapshot();
  video.emit('pause');
  video.emit('ended');
  assert.equal(controller.getSnapshot(), snapshot);
  assert.equal(snapshot.status, 'playing');
  assert.equal(snapshot.sourceId, 12);
  controller.dispose();
});

test('a decode error survives late lifecycle events and clears when another clip loads', () => {
  const { video, controller } = setup();
  video.ready();
  video.currentTime = 8;
  video.emit('timeupdate');
  video.error = { code: 3 };
  video.emit('error');
  assert.match(controller.getSnapshot().error ?? '', /解码失败/);

  video.paused = false;
  video.emit('playing');
  video.emit('waiting');
  video.emit('canplay');
  video.ended = true;
  video.emit('ended');
  assert.equal(controller.getSnapshot().status, 'error');

  controller.load('adv-media://demo/replacement.mp4');
  assert.equal(controller.getSnapshot().error, null);
  assert.equal(controller.getSnapshot().currentTime, 0);
  assert.equal(controller.getSnapshot().duration, 0);
  assert.equal(controller.getSnapshot().status, 'loading');
  controller.dispose();
});

test('a previous play success cannot mark a replacement video as playing', async () => {
  const { video, controller } = setup();
  video.ready();
  const pending = deferred();
  video.playResult = () => pending.promise;
  const playback = controller.play();

  controller.load('adv-media://demo/replacement.mp4');
  const loadingSnapshot = controller.getSnapshot();
  pending.resolve();
  await playback;

  assert.equal(controller.getSnapshot(), loadingSnapshot);
  assert.equal(controller.getSnapshot().status, 'loading');
  assert.equal(controller.getSnapshot().currentTime, 0);
  controller.dispose();
});

test('pausing a pending play does not show the resulting abort as a failure', async () => {
  const { video, controller } = setup();
  video.ready();
  const pending = deferred();
  video.playResult = () => pending.promise;
  const playback = controller.play();
  controller.pause();

  pending.reject({ name: 'AbortError' });
  await playback;
  assert.equal(controller.getSnapshot().status, 'paused');
  assert.equal(controller.getSnapshot().error, null);
  controller.dispose();
});

test('seek ignores unknown bounds and non-finite input, and clamps to the loaded clip', () => {
  const { video, controller } = setup();
  controller.seek(8);
  assert.equal(video.currentTime, 0);
  video.ready(10);

  controller.seek(100);
  assert.equal(video.currentTime, 10);
  assert.equal(controller.getSnapshot().currentTime, 10);
  controller.seek(-4);
  assert.equal(video.currentTime, 0);
  controller.seek(4.5);
  const validSnapshot = controller.getSnapshot();

  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    controller.seek(value);
    assert.equal(video.currentTime, 4.5);
    assert.equal(controller.getSnapshot(), validSnapshot);
  }
  controller.dispose();
});

test('snapshots remain stable until a meaningful media change and track buffering separately', async () => {
  const { video, controller } = setup();
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => { notifications += 1; });
  const loadingSnapshot = controller.getSnapshot();
  video.emit('timeupdate');
  assert.equal(controller.getSnapshot(), loadingSnapshot);
  assert.equal(notifications, 0);

  video.duration = 20;
  video.readyState = 1;
  video.emit('loadedmetadata');
  assert.equal(controller.getSnapshot().status, 'loading');
  video.readyState = 4;
  video.emit('canplay');
  assert.equal(controller.getSnapshot().status, 'ready');
  await controller.play();
  assert.equal(controller.getSnapshot().status, 'playing');
  video.readyState = 2;
  video.emit('waiting');
  assert.equal(controller.getSnapshot().status, 'loading');
  video.readyState = 4;
  video.emit('playing');
  assert.equal(controller.getSnapshot().status, 'playing');

  controller.setVolume(3);
  assert.equal(controller.getSnapshot().volume, 1);
  controller.setVolume(-1);
  assert.equal(controller.getSnapshot().volume, 0);
  video.muted = true;
  video.emit('volumechange');
  assert.equal(controller.getSnapshot().muted, true);
  const volumeSnapshot = controller.getSnapshot();
  video.emit('volumechange');
  assert.equal(controller.getSnapshot(), volumeSnapshot);

  unsubscribe();
  const previousNotifications = notifications;
  video.currentTime = 20;
  video.ended = true;
  video.paused = true;
  video.emit('ended');
  assert.equal(controller.getSnapshot().status, 'ended');
  assert.equal(notifications, previousNotifications);
  controller.dispose();
});

test('dispose releases media and prevents all late events and pending results from notifying UI', async () => {
  const { video, controller } = setup();
  video.ready();
  const pending = deferred();
  video.playResult = () => pending.promise;
  const playback = controller.play();
  const lastSnapshot = controller.getSnapshot();
  let notifications = 0;
  controller.subscribe(() => { notifications += 1; });

  controller.dispose();
  controller.dispose();
  assert.equal(video.src, '');
  assert.equal(video.paused, true);
  video.error = { code: 3 };
  video.emit('error');
  video.emit('playing');
  video.emit('timeupdate');
  pending.reject({ name: 'NotSupportedError' });
  await playback;
  controller.load('adv-media://demo/late.mp4');
  controller.setVolume(0.5);
  controller.seek(4);
  controller.pause();
  await controller.play();
  await controller.replay();

  assert.equal(controller.getSnapshot(), lastSnapshot);
  assert.equal(notifications, 0);
  assert.equal(video.src, '');
});

test('a synchronous loading observer can replace the source without the outer load overwriting it', () => {
  const { video, controller } = setup();
  let replaced = false;
  controller.subscribe(() => {
    if (!replaced && controller.getSnapshot().status === 'loading') {
      replaced = true;
      controller.load('adv-media://asset/latest', 30);
    }
  });
  controller.load('adv-media://asset/outdated', 20);
  assert.equal(video.src, 'adv-media://asset/latest');
  assert.equal(controller.getSnapshot().sourceId, 30);
  controller.dispose();
});

test('a native load failure cannot replace the state of a source loaded reentrantly', () => {
  const { video, controller } = setup();
  const nativeLoad = video.load.bind(video);
  let replaced = false;
  video.load = () => {
    if (!replaced) {
      replaced = true;
      controller.load('adv-media://asset/latest', 30);
      throw new Error('outdated load failed');
    }
    nativeLoad();
  };
  controller.load('adv-media://asset/outdated', 20);
  assert.equal(video.src, 'adv-media://asset/latest');
  assert.equal(controller.getSnapshot().sourceId, 30);
  assert.equal(controller.getSnapshot().status, 'loading');
  assert.equal(controller.getSnapshot().error, null);
  controller.dispose();
});

test('disposing from a loading observer cannot reload a disposed media element', () => {
  const { video, controller } = setup();
  controller.subscribe(() => { controller.dispose(); });
  controller.load('adv-media://asset/outdated');
  assert.equal(video.src, '');
  assert.equal(video.paused, true);
});

test('a loading observer can cancel play before native playback starts', async () => {
  const { video, controller } = setup();
  video.ready();
  let nativePlayCalls = 0;
  video.playResult = async () => { nativePlayCalls += 1; };
  let cancelled = false;
  controller.subscribe(() => {
    if (!cancelled && controller.getSnapshot().status === 'loading') {
      cancelled = true;
      controller.pause();
    }
  });
  await controller.play();
  assert.equal(nativePlayCalls, 0);
  assert.equal(video.paused, true);
  assert.equal(controller.getSnapshot().status, 'paused');
  controller.dispose();
});

test('a synchronous pause observer can start a replacement scene without stale paused state', async () => {
  const { video, controller } = setup();
  video.ready();
  await controller.play();
  let replaced = false;
  controller.subscribe(() => {
    if (!replaced && controller.getSnapshot().status === 'paused') {
      replaced = true;
      controller.load('adv-media://asset/replacement');
      video.ready();
      void controller.play();
    }
  });
  controller.pause();
  // The replacement play promise has not settled yet, so stale paused must not overwrite loading.
  assert.equal(controller.getSnapshot().status, 'loading');
  assert.equal(video.paused, false);
  await Promise.resolve();
  assert.equal(controller.getSnapshot().status, 'playing');
  controller.dispose();
});

test('replay does not start a replacement source loaded by a synchronous seek observer', async () => {
  const { video, controller } = setup();
  video.ready();
  video.currentTime = 5;
  video.emit('timeupdate');
  let replaced = false;
  let nativePlayCalls = 0;
  video.playResult = async () => { nativePlayCalls += 1; };
  controller.subscribe(() => {
    if (!replaced && controller.getSnapshot().currentTime === 0) {
      replaced = true;
      controller.load('adv-media://asset/replacement');
    }
  });
  await controller.replay();
  assert.equal(video.src, 'adv-media://asset/replacement');
  assert.equal(video.paused, true);
  assert.equal(nativePlayCalls, 0);
  controller.dispose();
});
