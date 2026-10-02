import assert from 'node:assert/strict';
import test from 'node:test';
import { StoryEditor } from '../src/authoring';
import type { StoryDefinition, StoryNode } from '../src/runtime/types';

function story(): StoryDefinition {
  return { schemaVersion: 1, nodes: [
    { id: 'intro', type: 'video', mediaId: 'intro', next: 'choice' },
    { id: 'choice', type: 'choice', prompt: '继续？', options: [
      { id: 'continue', label: '继续', description: '看下一段', next: 'clip' },
      { id: 'leave', label: '结束', next: 'end' },
    ] },
    { id: 'clip', type: 'video', mediaId: 'clip', next: 'end' },
    { id: 'end', type: 'end', title: '结束', description: '' },
  ] };
}

const mediaIds = new Set(['intro', 'clip', 'extra']);

test('draft editing adds, replaces and removes nodes without silently rewriting other content', () => {
  const editor = new StoryEditor(story(), 'intro');
  editor.addNode({ id: 'extra', type: 'video', mediaId: 'extra', next: 'end' });
  editor.connect('choice', 'extra', 'leave');
  const choiceBefore = editor.getSnapshot().story.nodes.find((node) => node.id === 'choice');
  editor.updateNode({ id: 'extra', type: 'end', title: '另一个结局', description: '完整替换节点' });
  assert.equal(editor.getSnapshot().story.nodes.find((node) => node.id === 'extra')?.type, 'end');
  editor.removeNode('extra');
  const choiceAfter = editor.getSnapshot().story.nodes.find((node) => node.id === 'choice');
  assert.deepEqual(choiceAfter, choiceBefore);
  const result = editor.validate(mediaIds);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /不存在的节点 extra/);
  editor.connect('choice', 'end', 'leave');
  assert.deepEqual(editor.validate(mediaIds), { ok: true });
});

test('deleting the entry is an editable draft and undo restores the entry and graph together', () => {
  const editor = new StoryEditor(story(), 'intro');
  const before = editor.export();
  editor.removeNode('intro');
  assert.equal(editor.getSnapshot().entryNodeId, 'intro');
  const result = editor.validate(mediaIds);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /入口剧情节点不存在/);
  assert.equal(editor.undo(), true);
  assert.deepEqual(editor.export(), before);
  editor.setEntry('choice');
  assert.equal(editor.getSnapshot().entryNodeId, 'choice');
  assert.equal(editor.undo(), true);
  assert.equal(editor.getSnapshot().entryNodeId, 'intro');
  assert.equal(editor.redo(), true);
  assert.equal(editor.getSnapshot().entryNodeId, 'choice');
});

test('empty, disconnected and dangling drafts are accepted but full validation rejects them', () => {
  const empty = new StoryEditor({ schemaVersion: 1, nodes: [] }, 'start');
  assert.equal(empty.validate(mediaIds).ok, false);
  empty.addNode({ id: 'start', type: 'video', mediaId: 'intro', next: 'end' });
  assert.equal(empty.validate(mediaIds).ok, false);
  empty.addNode({ id: 'end', type: 'end', title: '结束', description: '' });
  assert.deepEqual(empty.validate(mediaIds), { ok: true });
  empty.addNode({ id: 'orphan', type: 'end', title: '草稿结局', description: '' });
  const disconnected = empty.validate(mediaIds);
  assert.equal(disconnected.ok, false);
  if (!disconnected.ok) assert.match(disconnected.error, /入口无法到达/);
  empty.removeNode('orphan');
  empty.connect('start', 'start');
  assert.equal(empty.validate(mediaIds).ok, false);
});

test('validation includes media references and paths to an ending without changing edit history', () => {
  const editor = new StoryEditor(story(), 'intro');
  const before = editor.getSnapshot();
  const missingMedia = editor.validate(new Set(['intro']));
  assert.equal(missingMedia.ok, false);
  if (!missingMedia.ok) assert.match(missingMedia.error, /不存在的视频素材 clip/);
  assert.equal(editor.getSnapshot(), before);
  editor.connect('clip', 'clip');
  const loop = editor.validate(mediaIds);
  assert.equal(loop.ok, false);
  if (!loop.ok) assert.match(loop.error, /无法到达任何结局/);
  editor.connect('clip', 'choice');
  assert.deepEqual(editor.validate(mediaIds), { ok: true });
});

test('connect updates only the selected link and enforces video, choice and ending rules', () => {
  const editor = new StoryEditor(story(), 'intro');
  editor.connect('intro', 'end');
  assert.deepEqual(editor.getSnapshot().story.nodes[0], { id: 'intro', type: 'video', mediaId: 'intro', next: 'end' });
  editor.connect('choice', 'intro', 'leave');
  const node = editor.getSnapshot().story.nodes[1];
  assert.equal(node.type, 'choice');
  if (node.type !== 'choice') assert.fail('expected choice');
  assert.equal(node.options[0].next, 'clip');
  assert.equal(node.options[1].next, 'intro');
  const snapshot = editor.getSnapshot();
  for (const action of [
    () => editor.connect('intro', 'end', 'leave'),
    () => editor.connect('choice', 'end'),
    () => editor.connect('choice', 'end', 'missing'),
    () => editor.connect('end', 'intro'),
    () => editor.connect('intro', 'missing'),
    () => editor.connect('missing', 'intro'),
  ]) {
    assert.throws(action);
    assert.equal(editor.getSnapshot(), snapshot);
  }
});

test('invalid shapes and duplicate IDs fail atomically without entering history', () => {
  assert.throws(() => new StoryEditor({ schemaVersion: 1, nodes: [...story().nodes, story().nodes[0]] }, 'intro'), /ID 重复/);
  const badChoice: StoryNode = { id: 'bad', type: 'choice', prompt: '重复', options: [
    { id: 'same', label: '一', next: 'end' }, { id: 'same', label: '二', next: 'end' },
  ] };
  assert.throws(() => new StoryEditor({ schemaVersion: 1, nodes: [badChoice] }, 'bad'), /选项 ID 重复/);
  const editor = new StoryEditor(story(), 'intro');
  const snapshot = editor.getSnapshot();
  for (const action of [
    () => editor.addNode(story().nodes[0]),
    () => editor.addNode(badChoice),
    () => editor.updateNode({ id: 'choice', type: 'choice', prompt: '没有选项', options: [] }),
    () => editor.updateNode({ id: 'missing', type: 'end', title: '不存在', description: '' }),
    () => editor.removeNode('missing'),
    () => editor.setEntry('missing'),
    () => editor.addNode({ id: 'bad', type: 'video', mediaId: 'intro', next: '' }),
  ]) {
    assert.throws(action);
    assert.equal(editor.getSnapshot(), snapshot);
    assert.equal(editor.undo(), false);
  }
});

test('undo and redo restore exact documents while revisions always increase', () => {
  const editor = new StoryEditor(story(), 'intro');
  const versions = [editor.export()];
  editor.updateNode({ id: 'end', type: 'end', title: '新标题', description: '描述' });
  versions.push(editor.export());
  editor.setEntry('choice');
  versions.push(editor.export());
  editor.removeNode('clip');
  versions.push(editor.export());
  let revision = 3;
  for (let index = 2; index >= 0; index -= 1) {
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.export(), versions[index]);
    assert.equal(editor.getSnapshot().revision, ++revision);
  }
  assert.equal(editor.getSnapshot().canUndo, false);
  assert.equal(editor.getSnapshot().canRedo, true);
  assert.equal(editor.undo(), false);
  for (let index = 1; index <= 3; index += 1) {
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.export(), versions[index]);
    assert.equal(editor.getSnapshot().revision, ++revision);
  }
  assert.equal(editor.getSnapshot().canRedo, false);
  const latest = editor.getSnapshot();
  assert.equal(editor.redo(), false);
  assert.equal(editor.getSnapshot(), latest);
});

test('failed or unchanged edits keep redo available, while a new edit discards the redo branch', () => {
  const editor = new StoryEditor(story(), 'intro');
  editor.setEntry('choice');
  editor.undo();
  const previous = editor.getSnapshot();
  assert.equal(editor.updateNode(story().nodes[0]), false);
  assert.equal(editor.connect('intro', 'choice'), false);
  assert.equal(editor.setEntry('intro'), false);
  assert.throws(() => editor.removeNode('missing'));
  assert.equal(editor.getSnapshot(), previous);
  assert.equal(editor.getSnapshot().canRedo, true);
  editor.updateNode({ id: 'end', type: 'end', title: '新的分支', description: '' });
  assert.equal(editor.getSnapshot().canRedo, false);
  assert.equal(editor.redo(), false);
});

test('constructor inputs, edited inputs, snapshots and exports cannot mutate one another', () => {
  const source = story();
  const editor = new StoryEditor(source, 'intro');
  const initial = editor.getSnapshot();
  const sourceChoice = source.nodes[1];
  if (sourceChoice.type !== 'choice') assert.fail('expected choice');
  sourceChoice.options[0].label = '外部修改';
  source.nodes.length = 0;
  assert.equal(editor.getSnapshot(), initial);
  assert.equal(initial.story.nodes.length, 4);
  const saved = editor.export();
  const savedChoice = saved.story.nodes[1];
  if (savedChoice.type !== 'choice') assert.fail('expected choice');
  savedChoice.options[0].next = 'changed';
  saved.entryNodeId = 'changed';
  assert.deepEqual(editor.export(), { story: story(), entryNodeId: 'intro' });
  const choice = initial.story.nodes[1];
  if (choice.type !== 'choice') assert.fail('expected choice');
  assert.ok(Object.isFrozen(initial));
  assert.ok(Object.isFrozen(initial.story));
  assert.ok(Object.isFrozen(initial.story.nodes));
  assert.ok(Object.isFrozen(choice));
  assert.ok(Object.isFrozen(choice.options));
  assert.ok(Object.isFrozen(choice.options[0]));
  assert.throws(() => { (choice.options[0] as { label: string }).label = '修改冻结快照'; }, TypeError);
  const update: StoryNode = { id: 'choice', type: 'choice', prompt: '新问题', options: [{ id: 'only', label: '继续', next: 'clip' }] };
  editor.updateNode(update);
  update.options[0].label = '更新后外部修改';
  const current = editor.getSnapshot().story.nodes[1];
  if (current.type !== 'choice') assert.fail('expected choice');
  assert.equal(current.options[0].label, '继续');
  assert.equal(choice.prompt, '继续？');
  assert.equal(editor.undo(), true);
  assert.deepEqual(editor.export(), { story: story(), entryNodeId: 'intro' });
});

test('each atomic edit sends one notification and unsubscribing is safe', () => {
  const editor = new StoryEditor(story(), 'intro');
  const revisions: number[] = [];
  const unsubscribe = editor.subscribe(() => revisions.push(editor.getSnapshot().revision));
  editor.connect('choice', 'intro', 'leave');
  assert.deepEqual(revisions, [1]);
  editor.validate(mediaIds);
  editor.export();
  assert.deepEqual(revisions, [1]);
  editor.undo();
  editor.redo();
  assert.deepEqual(revisions, [1, 2, 3]);
  unsubscribe();
  unsubscribe();
  editor.setEntry('choice');
  assert.deepEqual(revisions, [1, 2, 3]);
});

test('reentrant undo observes committed history without recursive notification stacks', () => {
  const editor = new StoryEditor(story(), 'intro');
  const original = editor.export();
  let depth = 0;
  let maxDepth = 0;
  const observed: number[] = [];
  editor.subscribe(() => {
    depth += 1;
    maxDepth = Math.max(maxDepth, depth);
    observed.push(editor.getSnapshot().revision);
    if (editor.getSnapshot().revision === 1) editor.undo();
    depth -= 1;
  });
  editor.removeNode('clip');
  assert.deepEqual(editor.export(), original);
  assert.deepEqual(observed, [1, 2]);
  assert.equal(maxDepth, 1);
  assert.equal(editor.getSnapshot().canRedo, true);
});
