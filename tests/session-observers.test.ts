import assert from 'node:assert/strict';
import test from 'node:test';
import { PreviewController } from '../src/renderer/preview-controller';
import type { LoadedGame } from '../src/runtime/types';
import { content, setupContent } from './helpers/content-session';

function loaded(id: string): LoadedGame {
  const candidate = content(id);
  return {
    loadId: id, previewEnabled: true, story: candidate.story,
    game: { id: 'test', title: id, subtitle: '', description: '', entryNodeId: candidate.entryNodeId },
    videoUrls: { ...candidate.mediaUrls }, mediaRevisions: { ...candidate.mediaRevisions },
  };
}

test('a throwing session observer cannot make preview release successfully installed media', async (t) => {
  const reported = t.mock.method(console, 'error', () => {});
  const { session, video } = setupContent();
  const released: string[] = [];
  let sequence = 0;
  const preview = new PreviewController({
    loadGame: async () => ({ ok: true, value: loaded(String(++sequence)) }),
    releaseGame: async (id) => { released.push(id); },
  });
  t.after(() => { session.dispose(); preview.dispose(); preview.unmount('1'); preview.unmount('2'); });
  await preview.load();
  preview.mount('1');
  preview.setInstaller((candidate, options) => {
    const result = session.applyContent({ story: candidate.story, entryNodeId: candidate.game.entryNodeId,
      mediaUrls: candidate.videoUrls, mediaRevisions: candidate.mediaRevisions }, options);
    if (result.ok) preview.mount(candidate.loadId);
    return result;
  });
  session.subscribe(() => { throw new Error('observer failed'); });
  let received = 0;
  session.subscribe(() => { received += 1; });
  assert.equal(await preview.load(), true);
  assert.equal(preview.getSnapshot().content?.loadId, '2');
  assert.equal(video.loads.at(-1)?.url, 'adv-media://2/intro');
  assert.deepEqual(released, []);
  assert.equal(received, 1);
  assert.equal(reported.mock.callCount(), 1);
});

test('observer failures do not block a reentrant content update or its final notifications', (t) => {
  const reported = t.mock.method(console, 'error', () => {});
  const { session, video } = setupContent();
  t.after(() => session.dispose());
  let replaced = false;
  let observed = 0;
  session.subscribe(() => {
    if (!replaced) {
      replaced = true;
      assert.equal(session.applyContent(content('nested'), { strategy: 'replay-node', nodeId: 'branch' }).ok, true);
    }
    throw new Error('observer failed after commit');
  });
  session.subscribe(() => { observed += 1; });
  assert.deepEqual(session.applyContent(content('outer'), { strategy: 'restart' }), { ok: true });
  assert.equal(session.getSnapshot().story.node.id, 'branch');
  assert.equal(video.loads.at(-1)?.url, 'adv-media://nested/branch');
  assert.equal(observed, 2);
  assert.equal(reported.mock.callCount(), 2);
});
