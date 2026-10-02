import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameInfo } from '../src/runtime/types';
import type { UIScreenParams } from '../src/ui/contracts';
import { bindPlayerUI, createPlayerUI } from '../src/ui/player-ui';
import type { UIEntry } from '../src/ui/ui-manager';
import { content, setupContent } from './helpers/content-session';

const game: GameInfo = { id: 'test', title: '原片名', subtitle: '', description: '', entryNodeId: 'intro' };

function setup() {
  const { session, video } = setupContent();
  const ui = createPlayerUI();
  const binding = bindPlayerUI(ui, session, game, {
    play: () => session.play(), pause: () => session.pause(), replay: () => session.replayCurrent(),
    seek: (time) => session.seek(time), setVolume: (volume) => session.setVolume(volume),
    retry: () => session.retry(), toggleFullscreen() {}, togglePlayback: () => session.play(),
  });
  return { session, video, ui, binding, dispose: () => { binding.dispose(); ui.dispose(); session.dispose(); } };
}

function screen<Name extends keyof UIScreenParams>(ui: ReturnType<typeof createPlayerUI>, name: Name) {
  const entry = ui.getSnapshot().entries.find((item) => item.name === name);
  assert.ok(entry);
  return entry as Extract<UIEntry<UIScreenParams>, { name: Name }>;
}

test('preserve and game updates keep a live settings instance, volume binding and resume intention', (t) => {
  const fixture = setup();
  t.after(fixture.dispose);
  const { session, video, ui, binding } = fixture;
  session.play();
  session.seek(4);
  binding.openSettings();
  const settings = screen(ui, 'settings');
  const previousVisit = session.getSnapshot().story.visitId;
  assert.equal(session.applyContent(content('new'), { strategy: 'preserve' }).ok, true);
  binding.updateGame({ ...game, title: '新片名' });
  assert.ok(session.getSnapshot().story.visitId > previousVisit);
  assert.equal(screen(ui, 'settings').instanceId, settings.instanceId);
  assert.equal(screen(ui, 'playback').params.title, '新片名');
  session.setVolume(0.2);
  assert.equal(screen(ui, 'settings').params.volume, 0.2);
  assert.equal(video.loads.length, 1);
  assert.equal(session.getSnapshot().playback.currentTime, 4);
  settings.params.onClose();
  assert.equal(session.getSnapshot().playback.status, 'playing');
  assert.equal(video.plays, 2);
});

test('preserve while already paused or ready never invents a resume intention', (t) => {
  for (const status of ['ready', 'paused'] as const) {
    const fixture = setup();
    t.after(fixture.dispose);
    const { session, video, ui, binding } = fixture;
    if (status === 'paused') { session.play(); session.pause(); }
    const plays = video.plays;
    binding.openSettings();
    session.applyContent(content('new'), { strategy: 'preserve' });
    binding.updateGame({ ...game, title: '新片名' });
    ui.close('settings');
    assert.equal(session.getSnapshot().playback.status, status);
    assert.equal(video.plays, plays);
  }
});

test('restart and replay content updates invalidate an open modal resume intention', (t) => {
  for (const strategy of ['restart', 'replay-node'] as const) {
    const fixture = setup();
    t.after(fixture.dispose);
    const { session, video, ui, binding } = fixture;
    session.play();
    binding.openSettings();
    const sourceId = session.getSnapshot().playback.sourceId;
    session.applyContent(content('new'), { strategy });
    binding.updateGame({ ...game, title: '新片名' });
    assert.ok(session.getSnapshot().playback.sourceId > sourceId);
    const plays = video.plays;
    ui.close('settings');
    assert.equal(video.plays, plays);
    assert.equal(session.getSnapshot().playback.status, 'ready');
  }
});

test('updating game information leaves choice callbacks and settings instance ownership intact', (t) => {
  const fixture = setup();
  t.after(fixture.dispose);
  const { session, video, ui, binding } = fixture;
  video.emit({ status: 'ended' });
  const choice = screen(ui, 'choice');
  binding.openSettings();
  const oldSettings = screen(ui, 'settings');
  binding.updateGame({ ...game, title: '改片名' });
  assert.equal(screen(ui, 'choice').instanceId, choice.instanceId);
  ui.close('settings');
  binding.openSettings();
  const currentSettings = screen(ui, 'settings');
  oldSettings.params.onClose();
  assert.equal(screen(ui, 'settings').instanceId, currentSettings.instanceId);
  ui.close('settings');
  choice.params.onChoose('stop');
  assert.equal(session.getSnapshot().story.node.id, 'end');
  assert.equal(video.loads.length, 1);
});

test('reentrant game updates reconcile the newest title, and disposal ignores later updates', (t) => {
  const fixture = setup();
  t.after(fixture.dispose);
  const { ui, binding, video } = fixture;
  let changed = false;
  ui.subscribe(() => {
    if (changed) return;
    changed = true;
    binding.updateGame({ ...game, title: '最新片名' });
  });
  binding.updateGame({ ...game, title: '中间片名' });
  assert.equal(screen(ui, 'playback').params.title, '最新片名');
  const snapshot = ui.getSnapshot();
  binding.dispose();
  binding.updateGame({ ...game, title: '销毁后' });
  assert.equal(ui.getSnapshot(), snapshot);
  assert.equal(video.loads.length, 1);
});
