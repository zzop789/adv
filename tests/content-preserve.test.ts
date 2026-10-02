import assert from 'node:assert/strict';
import test from 'node:test';
import { content, setupContent } from './helpers/content-session';

test('matching fingerprints retain playback across URL leases and use the refreshed graph at ended', () => {
  const { session, video } = setupContent();
  session.play();
  session.seek(6);
  session.setVolume(0.3);
  const before = session.getSnapshot();
  const updated = content('new-lease');
  updated.story.nodes[0] = { id: 'intro', type: 'video', mediaId: 'intro', next: 'branch' };
  updated.story.nodes[2] = { id: 'branch', type: 'video', mediaId: 'branch', next: 'choice' };
  assert.equal(session.applyContent(updated, { strategy: 'preserve' }).ok, true);
  assert.equal(session.getSnapshot().playback, before.playback);
  assert.ok(session.getSnapshot().story.visitId > before.story.visitId);
  assert.equal(video.loads.length, 1);
  assert.equal(video.plays, 1);
  assert.equal(video.pauses, 0);
  video.emit({ status: 'ended' });
  assert.equal(session.getSnapshot().story.node.id, 'branch');
  assert.equal(video.loads.at(-1)?.url, 'adv-media://new-lease/branch');
  session.dispose();
});

test('preserve keeps paused state and retry takes the newest URL without reusing the source', () => {
  const { session, video } = setupContent();
  session.play();
  session.seek(3);
  session.pause();
  const before = session.getSnapshot();
  assert.equal(session.applyContent(content('new'), { strategy: 'preserve' }).ok, true);
  assert.equal(session.getSnapshot().playback, before.playback);
  session.retry();
  assert.equal(video.loads.at(-1)?.url, 'adv-media://new/intro');
  assert.ok(session.getSnapshot().playback.sourceId > before.playback.sourceId);
  session.dispose();
});

test('changed fingerprints, media IDs and node types reject preserve without touching playback', () => {
  const { session, video } = setupContent();
  const before = session.getSnapshot();
  const changedHash = { ...content(), mediaRevisions: { intro: 'changed', branch: 'branch-sha256' } };
  const changedMedia = content();
  changedMedia.story.nodes[0] = { id: 'intro', type: 'video', mediaId: 'branch', next: 'choice' };
  const changedType = content();
  changedType.story.nodes[0] = { id: 'intro', type: 'choice', prompt: '新入口', options: [{ id: 'go', label: '继续', next: 'choice' }] };
  const missingCurrent = content();
  missingCurrent.story.nodes[0] = { id: 'new-intro', type: 'video', mediaId: 'intro', next: 'choice' };
  missingCurrent.entryNodeId = 'new-intro';
  for (const candidate of [changedHash, changedMedia, changedType, missingCurrent]) {
    assert.equal(session.applyContent(candidate, { strategy: 'preserve' }).ok, false);
    assert.equal(session.getSnapshot(), before);
    assert.equal(video.loads.length, 1);
    assert.equal(video.pauses, 0);
  }
  session.dispose();
});

test('missing fingerprints only allow identical URLs, whether absent before or after the update', () => {
  for (const missing of ['before', 'after', 'both']) {
    const initial = content();
    const next = content();
    if (missing !== 'after') delete initial.mediaRevisions;
    if (missing !== 'before') delete next.mediaRevisions;
    const { session, video } = setupContent(initial);
    const changedUrl = { ...next, mediaUrls: { ...next.mediaUrls, intro: 'adv-media://other/intro' } };
    const before = session.getSnapshot();
    assert.equal(session.applyContent(changedUrl, { strategy: 'preserve' }).ok, false);
    assert.equal(session.getSnapshot(), before);
    assert.equal(session.applyContent(next, { strategy: 'preserve' }).ok, true);
    assert.equal(video.loads.length, 1);
    session.dispose();
  }
});

test('choice and ending edits preserve the frame and invalidate old choice callbacks', () => {
  const { session, video } = setupContent();
  video.emit({ status: 'ended', currentTime: 10 });
  const old = session.getSnapshot();
  const pauses = video.pauses;
  assert.equal(session.applyContent(content('new text'), { strategy: 'preserve' }).ok, true);
  const choice = session.getSnapshot();
  assert.equal(choice.story.node.type === 'choice' && choice.story.node.prompt, 'new text');
  assert.equal(choice.playback, old.playback);
  assert.equal(session.choose('stop', old.story.visitId), false);
  assert.equal(video.pauses, pauses);
  assert.equal(session.choose('stop', choice.story.visitId), true);
  const ending = session.getSnapshot();
  assert.equal(session.applyContent(content('new ending'), { strategy: 'preserve' }).ok, true);
  const result = session.getSnapshot();
  assert.equal(result.story.node.type === 'end' && result.story.node.title, 'new ending');
  assert.ok(result.story.visitId > ending.story.visitId);
  assert.equal(result.playback, ending.playback);
  assert.equal(video.loads.length, 1);
  session.dispose();
});

test('caller changes cannot mutate accepted story, fingerprints, effects or media maps', () => {
  const initial = content();
  initial.story.nodes[0].effect = { preset: 'fade', durationMs: 300 };
  const { session, video } = setupContent(initial);
  initial.story.nodes[0].effect.durationMs = 999;
  (initial.mediaUrls as Record<string, string>).intro = 'wrong-url';
  (initial.mediaRevisions as Record<string, string>).intro = 'wrong-hash';
  assert.equal(session.getSnapshot().story.node.effect?.durationMs, 300);
  assert.ok(Object.isFrozen(session.getSnapshot().story.node.effect));
  assert.equal(session.applyContent(content('new'), { strategy: 'preserve' }).ok, true);
  const replacement = content('replacement');
  session.applyContent(replacement, { strategy: 'restart' });
  (replacement.mediaUrls as Record<string, string>).intro = 'mutated-after-apply';
  replacement.story.nodes[0] = { id: 'intro', type: 'video', mediaId: 'intro', next: 'missing' };
  session.retry();
  assert.equal(video.loads.at(-1)?.url, 'adv-media://replacement/intro');
  video.emit({ status: 'ended' });
  assert.equal(session.getSnapshot().story.node.id, 'choice');
  session.dispose();
});
