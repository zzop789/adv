import assert from 'node:assert/strict';
import test from 'node:test';
import { DraftHistory, newNode } from '../src/editor/state/draft-history';
import type { StoryDefinition } from '../src/runtime/types';
import type { AuthoringSaveResult } from '../src/authoring/contracts';
import { saveDraft } from '../src/editor/state/save-draft';
const story: StoryDefinition = { schemaVersion: 1, nodes: [{ id: 'end', type: 'end', title: 'Initial', description: '', effect: { preset: 'fade', durationMs: 500 } }] };
test('draft history supports incomplete edits, deep undo/redo, and saved-state tracking', () => {
  const history = new DraftHistory(story);
  history.edit((draft) => { const node = draft.nodes[0]; if (node.type === 'end') node.title = ''; node.effect!.durationMs = 1000; });
  assert.equal(history.getSnapshot().dirty, true);
  assert.equal(story.nodes[0].effect!.durationMs, 500);
  history.undo(); assert.equal(history.getSnapshot().dirty, false);
  assert.equal(history.getSnapshot().story.nodes[0].effect!.durationMs, 500);
  history.redo(); assert.equal(history.getSnapshot().story.nodes[0].effect!.durationMs, 1000);
  history.markSaved(); assert.equal(history.getSnapshot().dirty, false);
  history.undo(); assert.equal(history.getSnapshot().dirty, true);
  history.redo(); assert.equal(history.getSnapshot().dirty, false);
});

test('an async save marks the submitted snapshot clean without losing edits made in flight', async () => {
  const history = new DraftHistory(story);
  history.edit((draft) => { draft.nodes[0].effect!.durationMs = 1000; });
  let resolve!: (result: AuthoringSaveResult) => void;
  const api = { save: () => new Promise<AuthoringSaveResult>((done) => { resolve = done; }) };
  const saving = saveDraft(api, history, 'old');
  history.edit((draft) => { draft.nodes[0].effect!.durationMs = 2000; });
  resolve({ ok: true, value: { revision: 'new' } });
  assert.equal(await saving, 'new');
  assert.equal(history.getSnapshot().dirty, true);
  history.undo();
  assert.equal(history.getSnapshot().story.nodes[0].effect!.durationMs, 1000);
  assert.equal(history.getSnapshot().dirty, false);
});
test('new edits clear redo and replacement resets history; generated IDs do not collide', () => {
  const history = new DraftHistory(story);
  const first = newNode('end', story, [], 'end');
  history.edit((draft) => draft.nodes.push(first));
  const next = newNode('end', history.getSnapshot().story, [], 'end');
  assert.notEqual(first.id, next.id);
  history.undo(); assert.equal(history.getSnapshot().canRedo, true);
  history.edit((draft) => draft.nodes.push(newNode('video', draft, ['clip'], 'end')));
  assert.equal(history.getSnapshot().canRedo, false);
  history.replace(story);
  assert.deepEqual(history.getSnapshot(), { story, dirty: false, canUndo: false, canRedo: false });
});
