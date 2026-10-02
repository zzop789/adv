import assert from 'node:assert/strict';
import test from 'node:test';
import { PreviewController } from '../src/renderer/preview-controller';
import type { GameLoadResult, LoadedGame } from '../src/runtime/types';

function content(loadId: string): LoadedGame {
  return {
    loadId, previewEnabled: true,
    game: { id: 'test', title: 'Test', subtitle: '', description: '', entryNodeId: 'opening' },
    story: { schemaVersion: 1, nodes: [{ id: 'opening', type: 'end', title: 'End', description: '' }] },
    videoUrls: {},
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('preview requests are serialized and failed candidates preserve the mounted version', async () => {
  const first = content('one');
  const next = deferred<GameLoadResult>();
  const released: string[] = [];
  let calls = 0;
  const preview = new PreviewController({
    loadGame: () => ++calls === 1 ? Promise.resolve({ ok: true, value: first }) : next.promise,
    releaseGame: async (id) => { released.push(id); },
  });
  await preview.load(); preview.mount('one');
  const loading = preview.load();
  assert.equal(await preview.load(), false);
  assert.equal(calls, 2);
  assert.equal(preview.getSnapshot().content, first);
  next.resolve({ ok: false, error: 'Invalid JSON' });
  assert.equal(await loading, false);
  assert.equal(preview.getSnapshot().content, first);
  assert.equal(preview.getSnapshot().error, 'Invalid JSON');
  assert.deepEqual(released, []);
  preview.dispose();
  assert.deepEqual(released, [], 'App cleanup must not release a live Player');
  preview.unmount('one');
  assert.deepEqual(released, ['one']);
});

test('successful replacement releases the previous version only after Player teardown', async () => {
  const released: string[] = [];
  let sequence = 0;
  const preview = new PreviewController({
    loadGame: async () => ({ ok: true, value: content(String(++sequence)) }),
    releaseGame: async (id) => { released.push(id); },
  });
  await preview.load(); preview.mount('1');
  await preview.load(); preview.mount('2');
  assert.deepEqual(released, []);
  assert.equal(preview.getSnapshot().content?.loadId, '2');
  preview.unmount('1'); preview.unmount('1');
  assert.deepEqual(released, ['1']);
  preview.dispose(); preview.unmount('2');
  assert.deepEqual(released, ['1', '2']);
});

test('uncommitted candidates are released when superseded or App unmounts', async () => {
  const released: string[] = [];
  let sequence = 0;
  const preview = new PreviewController({
    loadGame: async () => ({ ok: true, value: content(String(++sequence)) }),
    releaseGame: async (id) => { released.push(id); },
  });
  await preview.load(); await preview.load();
  assert.deepEqual(released, ['1']);
  preview.dispose(); preview.dispose();
  assert.deepEqual(released, ['1', '2']);
});

test('a load resolving after disposal releases its unused content without publishing', async () => {
  const pending = deferred<GameLoadResult>();
  const released: string[] = [];
  const preview = new PreviewController({ loadGame: () => pending.promise, releaseGame: async (id) => { released.push(id); } });
  let updates = 0;
  preview.subscribe(() => { updates += 1; });
  const loading = preview.load();
  preview.dispose();
  const before = updates;
  pending.resolve({ ok: true, value: content('late') });
  assert.equal(await loading, false);
  assert.deepEqual(released, ['late']);
  assert.equal(updates, before);
  assert.equal(preview.getSnapshot().content, null);
  assert.equal(await preview.load(), false);
});

test('a failed initial load can be retried successfully', async () => {
  let calls = 0;
  const preview = new PreviewController({
    loadGame: async () => ++calls === 1 ? { ok: false, error: 'Missing video' } : { ok: true, value: content('fixed') },
    releaseGame: async () => {},
  });
  assert.equal(await preview.load(), false);
  assert.equal(preview.getSnapshot().content, null);
  assert.equal(await preview.load(), true);
  assert.equal(preview.getSnapshot().error, null);
  assert.equal(preview.getSnapshot().content?.loadId, 'fixed');
  preview.dispose();
});
