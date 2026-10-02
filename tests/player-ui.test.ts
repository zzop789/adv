import assert from 'node:assert/strict';
import test from 'node:test';
import { StorySession, type VideoPort } from '../src/runtime/session';
import type { GameInfo, PlaybackActions, PlaybackSnapshot, StoryDefinition } from '../src/runtime/types';
import type { UIScreenParams } from '../src/ui/contracts';
import { bindPlayerUI, createPlayerUI } from '../src/ui/player-ui';
import type { UIEntry, UIManager } from '../src/ui/ui-manager';

class MediaPort implements VideoPort {
  private snapshot: PlaybackSnapshot = {
    sourceId: 0, status: 'idle', currentTime: 0, duration: 0, volume: 1, muted: false, error: null,
  };
  private readonly listeners = new Set<() => void>();
  readonly loads: Array<{ url: string; sourceId: number }> = [];
  plays = 0;
  pauses = 0;

  getSnapshot(): PlaybackSnapshot { return this.snapshot; }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  load(url: string, sourceId: number): void {
    this.loads.push({ url, sourceId });
    this.emit({ sourceId, status: 'loading', currentTime: 0, duration: 0, error: null });
  }
  play(): void { this.plays += 1; this.emit({ status: 'playing' }); }
  pause(): void {
    this.pauses += 1;
    if (!['ended', 'error', 'idle'].includes(this.snapshot.status)) this.emit({ status: 'paused' });
  }
  seek(currentTime: number): void { this.emit({ currentTime }); }
  setVolume(volume: number): void { this.emit({ volume }); }
  dispose(): void { this.listeners.clear(); }
  emit(patch: Partial<PlaybackSnapshot>): void {
    if (Object.entries(patch).every(([key, value]) => Object.is(this.snapshot[key as keyof PlaybackSnapshot], value))) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}

const game: GameInfo = { id: 'demo', title: '测试影片', subtitle: '', description: '', entryNodeId: 'intro' };
const story: StoryDefinition = { schemaVersion: 1, nodes: [
  { id: 'intro', type: 'video', mediaId: 'intro', next: 'choice' },
  { id: 'choice', type: 'choice', prompt: '继续？', options: [
    { id: 'forward', label: '继续', next: 'branch' },
    { id: 'leave', label: '结束', next: 'end' },
  ] },
  { id: 'branch', type: 'video', mediaId: 'branch', next: 'end' },
  { id: 'end', type: 'end', title: '落幕', description: '测试结局' },
] };

function createFixture(beforeBind?: (ui: UIManager<UIScreenParams>, session: StorySession) => void) {
  const media = new MediaPort();
  const session = new StorySession(story, 'intro', { intro: 'intro.webm', branch: 'branch.webm' }, media);
  media.emit({ status: 'ready', duration: 12 });
  const ui = createPlayerUI();
  const actions: PlaybackActions & { togglePlayback(): void } = {
    play: () => session.play(), pause: () => session.pause(), replay: () => session.replayCurrent(),
    seek: (time) => session.seek(time), setVolume: (volume) => session.setVolume(volume),
    toggleFullscreen: () => {}, retry: () => session.retry(),
    togglePlayback: () => {
      if (['playing', 'loading'].includes(session.getSnapshot().playback.status)) session.pause();
      else session.play();
    },
  };
  let subscriptions = 0;
  const presenterSession: Parameters<typeof bindPlayerUI>[1] = {
    getSnapshot: session.getSnapshot,
    subscribe: (listener) => {
      subscriptions += 1;
      const unsubscribe = session.subscribe(listener);
      return () => { subscriptions -= 1; unsubscribe(); };
    },
    play: () => session.play(), pause: () => session.pause(),
    choose: (optionId, visitId) => session.choose(optionId, visitId),
    restart: () => session.restart(), setVolume: (volume) => session.setVolume(volume),
  };
  beforeBind?.(ui, session);
  const binding = bindPlayerUI(ui, presenterSession, game, actions);
  return {
    media, session, ui, binding,
    activeSubscriptions: () => subscriptions,
    complete: () => media.emit({ status: 'ended', currentTime: 12, duration: 12 }),
    dispose: () => { binding.dispose(); ui.dispose(); session.dispose(); },
  };
}

function screen<Name extends keyof UIScreenParams>(ui: UIManager<UIScreenParams>, name: Name) {
  const entry = ui.getSnapshot().entries.find((candidate) => candidate.name === name);
  assert.ok(entry, `${name} screen is open`);
  return entry as Extract<UIEntry<UIScreenParams>, { name: Name }>;
}

test('choice callbacks retain the originating visit and cannot choose a later visit', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { session, ui } = fixture;
  fixture.complete();
  const oldChoice = screen(ui, 'choice').params;
  oldChoice.onChoose('leave');
  screen(ui, 'ending').params.onRestart();
  fixture.complete();
  const newVisit = session.getSnapshot().story;
  oldChoice.onChoose('forward');
  assert.equal(session.getSnapshot().story, newVisit);
  screen(ui, 'choice').params.onChoose('forward');
  assert.equal(session.getSnapshot().story.node.id, 'branch');
});

test('automatic playback, choice and ending screens never reload the active video by themselves', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { session, media, ui } = fixture;
  assert.equal(screen(ui, 'playback').params.status, 'ready');
  assert.equal(media.loads.length, 1);
  session.play();
  assert.equal(ui.isOpen('playback'), false);
  session.seek(4);
  session.pause();
  assert.equal(screen(ui, 'playback').params.status, 'paused');
  assert.equal(media.getSnapshot().currentTime, 4);
  fixture.complete();
  assert.equal(ui.isOpen('playback'), false);
  screen(ui, 'choice').params.onChoose('leave');
  assert.equal(ui.isOpen('choice'), false);
  assert.equal(ui.isOpen('ending'), true);
  assert.equal(media.loads.length, 1);
});

test('settings pause active playback and closing by callback or ordinary UI command resumes it', (t) => {
  for (const closeWithCallback of [true, false]) {
    const fixture = createFixture();
    t.after(fixture.dispose);
    const { session, media, ui, binding } = fixture;
    session.play();
    binding.openSettings();
    assert.equal(session.getSnapshot().playback.status, 'paused');
    assert.equal(screen(ui, 'playback').params.status, 'paused');
    const playsBeforeClose = media.plays;
    if (closeWithCallback) screen(ui, 'settings').params.onClose();
    else ui.close('settings');
    assert.equal(ui.isOpen('settings'), false);
    assert.equal(session.getSnapshot().playback.status, 'playing');
    assert.equal(media.plays, playsBeforeClose + 1);
    assert.equal(media.loads.length, 1);
  }
});

test('settings opened while ready or already paused never start playback on close', (t) => {
  for (const status of ['ready', 'paused'] as const) {
    const fixture = createFixture();
    t.after(fixture.dispose);
    const { session, media, ui, binding } = fixture;
    if (status === 'paused') session.pause();
    const plays = media.plays;
    binding.openSettings();
    screen(ui, 'settings').params.onClose();
    assert.equal(media.plays, plays);
    assert.equal(session.getSnapshot().playback.status, status);
  }
});

test('an old settings callback cannot close a newly opened settings instance', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { ui, binding } = fixture;
  binding.openSettings();
  const old = screen(ui, 'settings');
  ui.close('settings');
  binding.openSettings();
  const current = screen(ui, 'settings');
  assert.notEqual(old.instanceId, current.instanceId);
  old.params.onClose();
  assert.equal(screen(ui, 'settings').instanceId, current.instanceId);
  current.params.onClose();
  assert.equal(ui.isOpen('settings'), false);
});

test('settings volume reflects session changes and callbacks without replacing its instance', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { session, ui, binding } = fixture;
  binding.openSettings();
  const instanceId = screen(ui, 'settings').instanceId;
  session.setVolume(0.35);
  assert.equal(screen(ui, 'settings').params.volume, 0.35);
  screen(ui, 'settings').params.onVolumeChange(0.6);
  assert.equal(session.getSnapshot().playback.volume, 0.6);
  assert.equal(screen(ui, 'settings').params.volume, 0.6);
  assert.equal(screen(ui, 'settings').instanceId, instanceId);
  ui.close('settings');
  session.setVolume(0.2);
  assert.equal(ui.isOpen('settings'), false);
  binding.openSettings();
  assert.equal(screen(ui, 'settings').params.volume, 0.2);
});

test('restart while a modal is open invalidates the old resume intention', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { session, media, ui, binding } = fixture;
  session.play();
  binding.openSettings();
  const oldSource = session.getSnapshot().playback.sourceId;
  session.restart();
  assert.notEqual(session.getSnapshot().playback.sourceId, oldSource);
  assert.equal(session.getSnapshot().playback.status, 'paused');
  const plays = media.plays;
  ui.close('settings');
  assert.equal(media.plays, plays);
  assert.equal(session.getSnapshot().playback.status, 'paused');
});

test('disposing bindings releases subscriptions and never resumes paused media', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { session, media, ui, binding } = fixture;
  assert.equal(fixture.activeSubscriptions(), 1);
  session.play();
  binding.openSettings();
  const plays = media.plays;
  binding.dispose();
  binding.dispose();
  assert.equal(fixture.activeSubscriptions(), 0);
  ui.close('settings');
  assert.equal(media.plays, plays);
  assert.equal(session.getSnapshot().playback.status, 'paused');
  const uiSnapshot = ui.getSnapshot();
  session.play();
  assert.equal(ui.getSnapshot(), uiSnapshot);
  binding.openSettings();
  assert.equal(ui.isOpen('settings'), false);
});

test('a restart triggered while replacing story screens cannot reinsert an outdated ending', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { session, ui } = fixture;
  fixture.complete();
  let restarted = false;
  ui.subscribe(() => {
    if (!restarted && session.getSnapshot().story.node.type === 'end') {
      restarted = true;
      session.restart();
    }
  });
  screen(ui, 'choice').params.onChoose('leave');
  assert.equal(session.getSnapshot().story.node.id, 'intro');
  assert.equal(ui.isOpen('ending'), false);
  assert.equal(ui.isOpen('choice'), false);
});

test('a settings close callback works even when called synchronously during opening', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { ui, binding } = fixture;
  let closed = false;
  ui.subscribe(() => {
    if (!closed && ui.isOpen('settings')) {
      closed = true;
      screen(ui, 'settings').params.onClose();
    }
  });
  binding.openSettings();
  assert.equal(ui.isOpen('settings'), false);
});

test('a reentrant settings reopen keeps the latest handle for subsequent volume updates', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { session, ui, binding } = fixture;
  let reopened = false;
  ui.subscribe(() => {
    if (!reopened && ui.isOpen('settings')) {
      reopened = true;
      ui.close('settings');
      binding.openSettings();
    }
  });
  binding.openSettings();
  const instanceId = screen(ui, 'settings').instanceId;
  session.setVolume(0.4);
  assert.equal(screen(ui, 'settings').params.volume, 0.4);
  assert.equal(screen(ui, 'settings').instanceId, instanceId);
});

test('binding to a manager with an existing modal pauses playing media immediately', (t) => {
  const fixture = createFixture((ui, session) => {
    session.play();
    ui.open('settings', { volume: 1, onVolumeChange: () => {}, onFullscreen: () => {}, onClose: () => {} });
  });
  t.after(fixture.dispose);
  assert.equal(fixture.session.getSnapshot().playback.status, 'paused');
  const plays = fixture.media.plays;
  fixture.ui.close('settings');
  assert.equal(fixture.media.plays, plays + 1);
});

test('volume changed synchronously while settings opens reaches the newly acquired handle', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { session, ui, binding } = fixture;
  let changed = false;
  ui.subscribe(() => {
    if (!changed && ui.isOpen('settings')) {
      changed = true;
      session.setVolume(0.4);
    }
  });
  binding.openSettings();
  assert.equal(session.getSnapshot().playback.volume, 0.4);
  assert.equal(screen(ui, 'settings').params.volume, 0.4);
});

test('disposing the presenter and manager during a screen transition stops the old reconciliation', (t) => {
  const fixture = createFixture();
  t.after(fixture.dispose);
  const { session, ui, binding } = fixture;
  fixture.complete();
  const choice = screen(ui, 'choice').params;
  let disposed = false;
  ui.subscribe(() => {
    if (!disposed && session.getSnapshot().story.node.type === 'end') {
      disposed = true;
      binding.dispose();
      ui.dispose();
    }
  });
  assert.doesNotThrow(() => choice.onChoose('leave'));
  assert.equal(disposed, true);
  assert.deepEqual(ui.getSnapshot().entries, []);
  assert.equal(fixture.activeSubscriptions(), 0);
});
