import assert from 'node:assert/strict';
import test from 'node:test';
import { storySchema, validateStory } from '../src/runtime/story-schema';
import type { NodeEffect } from '../src/runtime/types';
import { content, setupContent } from './helpers/content-session';

test('all story node types support validated optional entrance effects', () => {
  const sample = content();
  sample.story.nodes.forEach((node, index) => {
    node.effect = { preset: ['none', 'fade', 'slide-up'][index % 3] as NodeEffect['preset'], durationMs: index ? 10_000 : 0 };
  });
  assert.doesNotThrow(() => validateStory(sample.story, sample.entryNodeId, new Set(Object.keys(sample.mediaUrls))));
  const parsed = storySchema.parse(sample.story);
  assert.deepEqual(parsed.nodes.map((node) => node.effect), sample.story.nodes.map((node) => node.effect));
});

test('malformed effects reject content atomically before changing playback', () => {
  const { session, video } = setupContent();
  const before = session.getSnapshot();
  for (const effect of [
    { preset: 'fade', durationMs: -1 }, { preset: 'fade', durationMs: 10_001 },
    { preset: 'fade', durationMs: Number.NaN }, { preset: 'fade', durationMs: Infinity },
    { preset: 'unknown', durationMs: 300 }, { preset: 'fade' },
    { preset: 'fade', durationMs: 300, unexpected: true },
  ]) {
    const candidate = content();
    candidate.story.nodes[0].effect = effect as NodeEffect;
    assert.equal(session.applyContent(candidate, { strategy: 'restart' }).ok, false);
    assert.equal(session.getSnapshot(), before);
  }
  assert.equal(video.loads.length, 1);
  session.dispose();
});
