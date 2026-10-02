import assert from 'node:assert/strict';
import test from 'node:test';
import { StoryRunner } from '../src/runtime/story-runner';
import { storySchema, validateStory } from '../src/runtime/story-schema';
import type { StoryDefinition } from '../src/runtime/types';

function branchingStory(): StoryDefinition {
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'intro', type: 'video', mediaId: 'opening', next: 'choice' },
      { id: 'choice', type: 'choice', prompt: '走哪边？', options: [
        { id: 'left', label: '左边', next: 'left_clip' },
        { id: 'right', label: '右边', next: 'right_clip' },
      ] },
      { id: 'left_clip', type: 'video', mediaId: 'left', next: 'left_end' },
      { id: 'right_clip', type: 'video', mediaId: 'right', next: 'right_end' },
      { id: 'left_end', type: 'end', title: '左侧结局', description: '' },
      { id: 'right_end', type: 'end', title: '右侧结局', description: '' },
    ],
  };
}

const mediaIds = new Set(['opening', 'left', 'right']);

test('both authored branches reach their own ending and end nodes cannot advance', () => {
  for (const direction of ['left', 'right']) {
    const runner = new StoryRunner(branchingStory(), 'intro');
    assert.equal(runner.getSnapshot().node.id, 'intro');
    assert.equal(runner.choose(direction, runner.getSnapshot().visitId), false);
    assert.equal(runner.completeVideo(runner.getSnapshot().visitId), true);
    assert.equal(runner.getSnapshot().node.id, 'choice');
    assert.equal(runner.completeVideo(runner.getSnapshot().visitId), false);
    assert.equal(runner.choose(direction, runner.getSnapshot().visitId), true);
    assert.equal(runner.getSnapshot().node.id, `${direction}_clip`);
    assert.equal(runner.completeVideo(runner.getSnapshot().visitId), true);
    const ending = runner.getSnapshot();
    assert.equal(ending.node.id, `${direction}_end`);
    assert.equal(runner.completeVideo(ending.visitId), false);
    assert.equal(runner.choose(direction, ending.visitId), false);
    assert.equal(runner.getSnapshot(), ending);
  }
});

test('duplicate video completions and repeated choices are accepted at most once per visit', () => {
  const runner = new StoryRunner(branchingStory(), 'intro');
  const introVisit = runner.getSnapshot().visitId;
  runner.completeVideo(introVisit);
  assert.equal(runner.completeVideo(introVisit), false);
  const choiceVisit = runner.getSnapshot().visitId;
  assert.equal(runner.choose('missing', choiceVisit), false);
  assert.equal(runner.choose('left', choiceVisit), true);
  assert.equal(runner.choose('right', choiceVisit), false);
  assert.equal(runner.completeVideo(introVisit), false);
  assert.equal(runner.getSnapshot().node.id, 'left_clip');
});

test('restart invalidates old input even when the same node is revisited', () => {
  const runner = new StoryRunner(branchingStory(), 'intro');
  const oldIntro = runner.getSnapshot();
  runner.completeVideo(oldIntro.visitId);
  const oldChoice = runner.getSnapshot();
  runner.restart();
  const newIntro = runner.getSnapshot();
  assert.equal(newIntro.node.id, 'intro');
  assert.equal(newIntro.runId, oldIntro.runId + 1);
  assert.ok(newIntro.visitId > oldChoice.visitId);
  assert.equal(runner.completeVideo(oldIntro.visitId), false);
  runner.completeVideo(newIntro.visitId);
  assert.equal(runner.choose('right', oldChoice.visitId), false);
  assert.equal(runner.getSnapshot().node.id, 'choice');
});

test('story snapshots are stable, isolated from authored mutations, and protected from observer writes', () => {
  const authored = branchingStory();
  const runner = new StoryRunner(authored, 'intro');
  const initial = runner.getSnapshot();
  let notifications = 0;
  const unsubscribe = runner.subscribe(() => { notifications += 1; });
  authored.nodes[0].id = 'changed';
  assert.equal(runner.getSnapshot(), initial);
  assert.equal(initial.node.id, 'intro');
  assert.throws(() => { initial.node.id = 'changed'; }, TypeError);
  runner.choose('missing', initial.visitId);
  assert.equal(notifications, 0);
  runner.completeVideo(initial.visitId);
  assert.equal(notifications, 1);
  unsubscribe();
  runner.restart();
  assert.equal(notifications, 1);
});

test('reentrant duplicate callbacks see the newly committed visit', () => {
  const runner = new StoryRunner(branchingStory(), 'intro');
  const visitId = runner.getSnapshot().visitId;
  runner.subscribe(() => { assert.equal(runner.completeVideo(visitId), false); });
  assert.equal(runner.completeVideo(visitId), true);
  assert.equal(runner.getSnapshot().node.id, 'choice');
});

test('story validation rejects missing references and duplicate authored identifiers', () => {
  const cases: Array<[string, (story: StoryDefinition) => void, RegExp]> = [
    ['duplicate node', (story) => { story.nodes.push({ ...story.nodes[0] }); }, /节点 ID 重复/],
    ['missing destination', (story) => {
      const node = story.nodes[0];
      if (node.type === 'video') node.next = 'missing';
    }, /不存在的节点/],
    ['missing media', (story) => {
      const node = story.nodes[0];
      if (node.type === 'video') node.mediaId = 'missing';
    }, /不存在的视频素材/],
    ['duplicate option', (story) => {
      const node = story.nodes[1];
      if (node.type === 'choice') node.options[1].id = node.options[0].id;
    }, /选项 ID 重复/],
    ['unreachable node', (story) => {
      story.nodes.push({ id: 'orphan', type: 'end', title: '不可达', description: '' });
    }, /无法到达的剧情节点/],
  ];
  for (const [name, mutate, message] of cases) {
    const story = branchingStory();
    mutate(story);
    assert.throws(() => validateStory(story, 'intro', mediaIds), message, name);
  }
  assert.throws(() => validateStory(branchingStory(), 'missing', mediaIds), /入口剧情节点不存在/);
  assert.equal(storySchema.safeParse({ schemaVersion: 9, nodes: [] }).success, false);
});

test('story validation rejects trapped loops and accepts loops that have an ending exit', () => {
  const story: StoryDefinition = {
    schemaVersion: 1,
    nodes: [
      { id: 'choice', type: 'choice', prompt: '继续？', options: [
        { id: 'loop', label: '继续', next: 'clip' },
        { id: 'leave', label: '离开', next: 'end' },
      ] },
      { id: 'clip', type: 'video', mediaId: 'opening', next: 'choice' },
      { id: 'end', type: 'end', title: '结束', description: '' },
    ],
  };
  assert.doesNotThrow(() => validateStory(story, 'choice', mediaIds));
  const clip = story.nodes[1];
  if (clip.type === 'video') clip.next = 'clip';
  assert.throws(() => validateStory(story, 'choice', mediaIds), /无法到达任何结局.*clip/);

  assert.throws(() => validateStory({ schemaVersion: 1, nodes: [
    { id: 'loop', type: 'video', mediaId: 'opening', next: 'loop' },
  ] }, 'loop', mediaIds), /至少包含一个 end/);
});
