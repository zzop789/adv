import assert from 'node:assert/strict';
import test from 'node:test';
import { StorySession } from '../src/runtime/session';
import { VideoController } from '../src/presentation/video-controller';
import { content } from './helpers/content-session';
import { ContentMediaElement } from './helpers/content-media-element';

function setup() {
  const video = new ContentMediaElement();
  const candidate = content();
  const session = new StorySession(candidate.story, candidate.entryNodeId, candidate.mediaUrls,
    new VideoController(video as unknown as HTMLVideoElement), candidate.mediaRevisions);
  return { video, session };
}

test('real controller preserves the physical source, position and pending play across content leases', async () => {
  const { session, video } = setup();
  video.ready();
  let finishPlay!: () => void;
  video.playResult = () => new Promise<void>((resolve) => { finishPlay = resolve; });
  session.play();
  session.seek(5);
  const before = session.getSnapshot();
  assert.equal(session.applyContent(content('new'), { strategy: 'preserve' }).ok, true);
  assert.equal(video.src, 'adv-media://original/intro');
  assert.equal(video.currentTime, 5);
  assert.equal(video.loads, 1);
  assert.equal(session.getSnapshot().playback, before.playback);
  finishPlay();
  await Promise.resolve();
  assert.equal(session.getSnapshot().playback.status, 'playing');
  video.finish();
  const choice = session.getSnapshot().story;
  assert.equal(choice.node.type === 'choice' && choice.node.prompt, 'new');
  session.choose('go', choice.visitId);
  assert.equal(video.src, 'adv-media://new/branch');
  session.dispose();
});

test('replacing content cancels old promises and ignores delayed ended while the new source waits for play', async () => {
  const { session, video } = setup();
  video.ready();
  let rejectOld!: (error: unknown) => void;
  video.playResult = () => new Promise<void>((_resolve, reject) => { rejectOld = reject; });
  session.play();
  assert.equal(session.applyContent(content('new'), { strategy: 'replay-node', nodeId: 'branch' }).ok, true);
  video.ready();
  const replacement = session.getSnapshot();
  assert.equal(replacement.playback.status, 'ready');
  assert.equal(video.paused, true);
  assert.equal(video.plays, 1);
  rejectOld({ name: 'NotSupportedError' });
  await Promise.resolve();
  video.dispatchEvent(new Event('ended'));
  assert.equal(session.getSnapshot(), replacement);
  video.finish();
  assert.equal(session.getSnapshot().story.node.id, 'end');
  session.dispose();
});

test('a synchronous preserve during branch loading keeps its pending autoplay and refreshed graph', async () => {
  const { session, video } = setup();
  let applied = false;
  session.subscribe(() => {
    const snapshot = session.getSnapshot();
    if (!applied && snapshot.story.node.id === 'branch' && snapshot.playback.status === 'loading') {
      applied = true;
      assert.equal(session.applyContent(content('new'), { strategy: 'preserve' }).ok, true);
    }
  });
  video.ready();
  video.finish();
  session.choose('go', session.getSnapshot().story.visitId);
  video.ready();
  await Promise.resolve();
  assert.equal(applied, true);
  assert.equal(video.plays, 1);
  assert.equal(video.src, 'adv-media://original/branch');
  assert.equal(session.getSnapshot().playback.status, 'playing');
  video.finish();
  const end = session.getSnapshot().story.node;
  assert.equal(end.type === 'end' && end.title, 'new');
  session.dispose();
});

test('load failures are represented on the committed node and retry uses the latest content', async () => {
  const { session, video } = setup();
  video.failLoad = true;
  assert.equal(session.applyContent(content('new'), { strategy: 'replay-node', nodeId: 'branch' }).ok, true);
  assert.equal(session.getSnapshot().story.node.id, 'branch');
  assert.equal(session.getSnapshot().playback.status, 'error');
  video.failLoad = false;
  session.retry();
  video.ready();
  await Promise.resolve();
  assert.equal(video.src, 'adv-media://new/branch');
  assert.equal(session.getSnapshot().playback.status, 'playing');
  session.dispose();
});
