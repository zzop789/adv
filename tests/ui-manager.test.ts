import assert from 'node:assert/strict';
import test from 'node:test';
import { UIManager, type UIHandle, type UIName, type UIRegistry } from '../src/ui/ui-manager';

interface Screens {
  playback: { title: string; onPlay: () => void };
  choice: { prompt: string };
  ending: { title: string };
  settings: { section: 'audio' | 'display' };
}

function setup() {
  const registry: UIRegistry<Screens> = {
    playback: { layer: 'playback' }, choice: { layer: 'story' }, ending: { layer: 'story' }, settings: { layer: 'modal' },
  };
  return new UIManager<Screens>(registry);
}

function names(manager: UIManager<Screens>): UIName<Screens>[] {
  return manager.getSnapshot().entries.map((entry) => entry.name);
}

test('opening a screen twice updates params and brings the same instance to the front', () => {
  const manager = setup();
  const first = manager.open('choice', { prompt: '第一问' });
  const modal = manager.open('settings', { section: 'audio' });
  const second = manager.open('choice', { prompt: '第二问' });
  assert.equal(first.instanceId, second.instanceId);
  assert.deepEqual(names(manager), ['settings', 'choice']);
  assert.deepEqual(manager.getSnapshot().entries.at(-1)?.params, { prompt: '第二问' });
  assert.equal(first.update({ prompt: '第三问' }), true);
  assert.deepEqual(names(manager), ['settings', 'choice']);
  assert.equal(modal.close(), true);
  assert.deepEqual(names(manager), ['choice']);
});

test('show atomically replaces screens only in the same layer and keeps an existing instance', () => {
  const manager = setup();
  const play = manager.open('playback', { title: '片头', onPlay: () => {} });
  const choice = manager.open('choice', { prompt: '选择' });
  const ending = manager.open('ending', { title: '结局' });
  manager.open('settings', { section: 'audio' });
  let changes = 0;
  manager.subscribe(() => { changes += 1; });
  const shown = manager.show('choice', { prompt: '保留当前选择' });
  assert.equal(changes, 1);
  assert.equal(shown.instanceId, choice.instanceId);
  assert.deepEqual(names(manager), ['playback', 'settings', 'choice']);
  assert.equal(ending.close(), false);
  assert.equal(play.update({ title: '继续', onPlay: () => {} }), true);
});

test('stale handles cannot modify or close a reopened screen with the same name', () => {
  const manager = setup();
  const old = manager.open('choice', { prompt: '旧问题' });
  assert.equal(old.close(), true);
  assert.equal(old.close(), false);
  const fresh = manager.open('choice', { prompt: '新问题' });
  assert.notEqual(fresh.instanceId, old.instanceId);
  const snapshot = manager.getSnapshot();
  assert.equal(old.update({ prompt: '不应出现' }), false);
  assert.equal(old.close(), false);
  assert.equal(manager.getSnapshot(), snapshot);
  assert.equal(fresh.close(), true);
});

test('handles removed by exclusive show stay stale when their screen returns', () => {
  const manager = setup();
  const old = manager.show('choice', { prompt: '旧选择' });
  manager.show('ending', { title: '落幕' });
  const fresh = manager.show('choice', { prompt: '新选择' });
  assert.notEqual(old.instanceId, fresh.instanceId);
  assert.equal(old.close(), false);
  assert.equal(old.update({ prompt: '过期' }), false);
  assert.equal(manager.isOpen('choice'), true);
  assert.equal(manager.isOpen('ending'), false);
});

test('closeTop follows stack order with optional layer filtering and closeLayer is idempotent', () => {
  const manager = setup();
  manager.open('playback', { title: '片头', onPlay: () => {} });
  manager.open('choice', { prompt: '选择' });
  manager.open('ending', { title: '结束' });
  manager.open('settings', { section: 'audio' });
  assert.equal(manager.closeTop('story'), true);
  assert.deepEqual(names(manager), ['playback', 'choice', 'settings']);
  assert.equal(manager.closeTop('missing-layer'), false);
  assert.equal(manager.closeLayer('story'), 1);
  assert.equal(manager.closeLayer('story'), 0);
  assert.equal(manager.closeTop(), true);
  assert.deepEqual(names(manager), ['playback']);
  assert.equal(manager.close('playback'), true);
  assert.equal(manager.close('playback'), false);
  assert.equal(manager.closeTop(), false);
});

test('snapshots and entries are shallow frozen and stable while callbacks retain identity', () => {
  const manager = setup();
  const onPlay = () => {};
  const params = { title: '播放', onPlay };
  const handle = manager.open('playback', params);
  const snapshot = manager.getSnapshot();
  const entry = snapshot.entries[0];
  assert.equal(entry.params, params);
  if (entry.name !== 'playback') assert.fail('expected playback');
  assert.equal(entry.params.onPlay, onPlay);
  assert.equal(Object.isFrozen(params), false);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.entries), true);
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(handle), true);
  let notifications = 0;
  const unsubscribe = manager.subscribe(() => { notifications += 1; });
  manager.open('playback', params);
  manager.show('playback', params);
  handle.update(params);
  manager.close('settings');
  assert.equal(manager.getSnapshot(), snapshot);
  assert.equal(notifications, 0);
  handle.update({ title: '新标题', onPlay });
  assert.equal(notifications, 1);
  unsubscribe();
  unsubscribe();
  manager.close('playback');
  assert.equal(notifications, 1);
});

test('registry definitions are copied and invalid names or layers are rejected', () => {
  const registry = { choice: { layer: 'story' }, ending: { layer: 'story' } };
  const manager = new UIManager<Pick<Screens, 'choice' | 'ending'>>(registry);
  registry.choice.layer = 'modal';
  manager.open('choice', { prompt: '选择' });
  assert.equal(manager.getSnapshot().entries[0].layer, 'story');
  manager.show('ending', { title: '结束' });
  assert.equal(manager.isOpen('choice'), false);
  assert.throws(() => manager.open('missing' as 'choice', { prompt: '' }), /未注册/);
  assert.throws(() => manager.show('missing' as 'choice', { prompt: '' }), /未注册/);
  assert.throws(() => manager.close('missing' as 'choice'), /未注册/);
  assert.throws(() => manager.isOpen('missing' as 'choice'), /未注册/);
  assert.throws(() => new UIManager({ broken: { layer: '' } }), /layer/);
  assert.throws(() => new UIManager({ broken: null } as unknown as UIRegistry<{ broken: object }>), /layer/);
});

test('reentrant observers can reopen a name without allowing the original returned handle to close it', () => {
  const manager = setup();
  let reopened: UIHandle<Screens, 'choice'> | undefined;
  let changed = false;
  let notifications = 0;
  let depth = 0;
  let maxDepth = 0;
  manager.subscribe(() => {
    depth += 1;
    maxDepth = Math.max(maxDepth, depth);
    notifications += 1;
    if (!changed && manager.isOpen('choice')) {
      changed = true;
      manager.close('choice');
      reopened = manager.open('choice', { prompt: '重新打开' });
    }
    depth -= 1;
  });
  const original = manager.open('choice', { prompt: '第一次' });
  assert.ok(reopened);
  assert.equal(notifications, 2);
  assert.equal(maxDepth, 1);
  assert.notEqual(original.instanceId, reopened.instanceId);
  assert.equal(original.close(), false);
  assert.equal(original.update({ prompt: '过期' }), false);
  assert.deepEqual(manager.getSnapshot().entries[0].params, { prompt: '重新打开' });
});

test('an observer unsubscribed by an earlier observer is not called again', () => {
  const manager = setup();
  let laterCalls = 0;
  let unsubscribeLater = () => {};
  manager.subscribe(() => { unsubscribeLater(); });
  unsubscribeLater = manager.subscribe(() => { laterCalls += 1; });
  manager.open('choice', { prompt: '选择' });
  manager.close('choice');
  assert.equal(laterCalls, 0);
});

test('dispose publishes an empty snapshot once, invalidates handles, and blocks reopening', () => {
  const manager = setup();
  const handle = manager.open('choice', { prompt: '选择' });
  let notifications = 0;
  manager.subscribe(() => { notifications += 1; });
  manager.dispose();
  const empty = manager.getSnapshot();
  assert.deepEqual(empty.entries, []);
  assert.equal(notifications, 1);
  assert.equal(handle.update({ prompt: '不应显示' }), false);
  assert.equal(handle.close(), false);
  assert.equal(manager.close('choice'), false);
  assert.equal(manager.closeLayer('story'), 0);
  assert.equal(manager.closeTop(), false);
  assert.equal(manager.isOpen('choice'), false);
  assert.throws(() => manager.open('choice', { prompt: '不应显示' }), /已销毁/);
  assert.throws(() => manager.show('choice', { prompt: '不应显示' }), /已销毁/);
  manager.subscribe(() => { assert.fail('disposed manager notified a new observer'); });
  manager.dispose();
  assert.equal(manager.getSnapshot(), empty);
  assert.equal(notifications, 1);
});

test('dispose from inside a notification finishes with an empty snapshot and no recursive callbacks', () => {
  const manager = setup();
  const observed: number[] = [];
  manager.subscribe(() => {
    if (manager.isOpen('choice')) manager.dispose();
  });
  manager.subscribe(() => { observed.push(manager.getSnapshot().entries.length); });
  const handle = manager.open('choice', { prompt: '选择' });
  assert.deepEqual(manager.getSnapshot().entries, []);
  assert.ok(observed.length > 0 && observed.every((count) => count === 0));
  assert.equal(handle.close(), false);
  assert.throws(() => manager.open('ending', { title: '不能复活' }), /已销毁/);
});

test('a failing observer does not leave later observers or notification state stuck', () => {
  const manager = setup();
  let successfulCalls = 0;
  const unsubscribeFailure = manager.subscribe(() => { throw new Error('observer failed'); });
  manager.subscribe(() => { successfulCalls += 1; });
  assert.throws(() => manager.open('choice', { prompt: '仍然提交' }), /observer failed/);
  assert.equal(manager.isOpen('choice'), true);
  assert.equal(successfulCalls, 1);
  unsubscribeFailure();
  assert.equal(manager.close('choice'), true);
  assert.equal(successfulCalls, 2);
});
