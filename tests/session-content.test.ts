import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContentUpdateOptions, SessionContent } from '../src/runtime/session';
import { content, setupContent } from './helpers/content-session';

test('restart commits graph and media together, resets position, and waits for play', () => {
  const { session, video } = setupContent();
  session.play();
  session.seek(4);
  const old = session.getSnapshot();
  const seen: Array<[string, string, number]> = [];
  session.subscribe(() => {
    const current = session.getSnapshot();
    seen.push([current.story.node.id, current.playback.status, current.playback.currentTime]);
    assert.equal(video.loads.at(-1)?.url, 'adv-media://new/intro');
  });
  assert.deepEqual(session.applyContent(content('new'), { strategy: 'restart' }), { ok: true });
  assert.deepEqual(seen, [['intro', 'ready', 0]]);
  assert.equal(session.getSnapshot().story.runId, old.story.runId + 1);
  assert.ok(session.getSnapshot().story.visitId > old.story.visitId);
  assert.ok(session.getSnapshot().playback.sourceId > old.playback.sourceId);
  assert.equal(video.plays, 1);
  session.dispose();
});

test('replay-node supports current or explicit nodes without autoplay and rejects missing targets', () => {
  const { session, video } = setupContent();
  const runId = session.getSnapshot().story.runId;
  assert.equal(session.applyContent(content('new'), { strategy: 'replay-node', nodeId: 'branch' }).ok, true);
  assert.equal(session.getSnapshot().story.node.id, 'branch');
  assert.equal(video.loads.at(-1)?.url, 'adv-media://new/branch');
  assert.equal(session.applyContent(content('third'), { strategy: 'replay-node' }).ok, true);
  assert.equal(video.loads.at(-1)?.url, 'adv-media://third/branch');
  assert.equal(session.getSnapshot().story.runId, runId);
  assert.equal(video.plays, 0);
  const before = session.getSnapshot();
  assert.equal(session.applyContent(content(), { strategy: 'replay-node', nodeId: 'missing' }).ok, false);
  assert.equal(session.getSnapshot(), before);
  assert.equal(video.loads.length, 3);
  session.dispose();
});

test('invalid graphs, references, entry and strategies leave the prior session untouched', () => {
  const { session, video } = setupContent();
  session.play();
  const before = session.getSnapshot();
  const invalid = content('broken');
  invalid.story.nodes.push({ id: 'unreachable', type: 'end', title: '孤立节点', description: '' });
  const cases: Array<[SessionContent, ContentUpdateOptions]> = [
    [invalid, { strategy: 'restart' }],
    [{ ...content(), entryNodeId: 'missing' }, { strategy: 'restart' }],
    [{ ...content(), mediaUrls: {} }, { strategy: 'restart' }],
    [content(), { strategy: 'unsupported' } as unknown as ContentUpdateOptions],
    [content(), { strategy: 'preserve', nodeId: 'branch' }],
  ];
  for (const [candidate, options] of cases) {
    assert.equal(session.applyContent(candidate, options).ok, false);
    assert.equal(session.getSnapshot(), before);
    assert.equal(video.loads.length, 1);
  }
  video.emit({ status: 'ended' });
  assert.equal(session.getSnapshot().story.node.id, 'choice');
  session.dispose();
});

test('old sources cannot advance replacement content and generations continue through retry and restart', () => {
  const { session, video } = setupContent();
  const source = session.getSnapshot().playback.sourceId;
  session.applyContent(content('new'), { strategy: 'replay-node', nodeId: 'branch' });
  const replacement = session.getSnapshot();
  video.emit({ sourceId: source, status: 'ended' });
  assert.equal(session.getSnapshot(), replacement);
  session.retry();
  const retrySource = session.getSnapshot().playback.sourceId;
  assert.ok(retrySource > replacement.playback.sourceId);
  session.restart();
  const restarted = session.getSnapshot();
  assert.ok(restarted.playback.sourceId > retrySource);
  video.emit({ sourceId: retrySource, status: 'error', error: 'old error' });
  assert.equal(session.getSnapshot(), restarted);
  session.dispose();
});

test('reentrant session observers see complete commits without recursive notification', () => {
  const { session, video } = setupContent();
  let depth = 0;
  let maxDepth = 0;
  let replaced = false;
  const ids: string[] = [];
  session.subscribe(() => {
    depth += 1;
    maxDepth = Math.max(depth, maxDepth);
    const current = session.getSnapshot();
    ids.push(current.story.node.id);
    if (!replaced) {
      replaced = true;
      assert.equal(session.applyContent(content('nested'), { strategy: 'replay-node', nodeId: 'branch' }).ok, true);
    }
    depth -= 1;
  });
  session.applyContent(content('outer'), { strategy: 'restart' });
  assert.deepEqual(ids, ['intro', 'branch']);
  assert.equal(maxDepth, 1);
  assert.equal(video.loads.at(-1)?.url, 'adv-media://nested/branch');
  assert.equal(session.getSnapshot().playback.sourceId, video.loads.at(-1)?.sourceId);
  session.dispose();
});

test('port observers cannot modify a half-applied transaction and disposal rejects new content', () => {
  const { session, video } = setupContent();
  const before = session.getSnapshot();
  const unsubscribe = video.subscribe(() => {
    assert.equal(session.getSnapshot(), before);
    assert.equal(session.applyContent(content('nested'), { strategy: 'restart' }).ok, false);
    session.restart();
    session.play();
  });
  assert.equal(session.applyContent(content('new'), { strategy: 'restart' }).ok, true);
  assert.equal(video.loads.length, 2);
  assert.equal(video.plays, 0);
  unsubscribe();
  session.dispose();
  assert.equal(session.applyContent(content(), { strategy: 'restart' }).ok, false);
  assert.equal(video.loads.length, 2);
});
