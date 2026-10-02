import assert from 'node:assert/strict';
import test from 'node:test';
import { StoryEditor } from '../src/authoring';
import type { EndNode } from '../src/runtime/types';

test('effect-only edits are tracked, frozen and isolated from inputs and exports', () => {
  const ending: EndNode = { id: 'end', type: 'end', title: 'End', description: '',
    effect: { preset: 'fade', durationMs: 300 } };
  const editor = new StoryEditor({ schemaVersion: 1, nodes: [ending] }, 'end');
  ending.effect!.durationMs = 999;
  assert.equal(editor.getSnapshot().story.nodes[0].effect?.durationMs, 300);
  assert.ok(Object.isFrozen(editor.getSnapshot().story.nodes[0].effect));
  editor.updateNode({ ...ending, effect: { preset: 'slide-up', durationMs: 400 } });
  assert.equal(editor.getSnapshot().revision, 1);
  assert.equal(editor.getSnapshot().story.nodes[0].effect?.preset, 'slide-up');
  const exported = editor.export();
  exported.story.nodes[0].effect!.durationMs = 800;
  assert.equal(editor.getSnapshot().story.nodes[0].effect?.durationMs, 400);
  editor.undo();
  assert.deepEqual(editor.getSnapshot().story.nodes[0].effect, { preset: 'fade', durationMs: 300 });
  editor.redo();
  assert.equal(editor.getSnapshot().story.nodes[0].effect?.durationMs, 400);
});
