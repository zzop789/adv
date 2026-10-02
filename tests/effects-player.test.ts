import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectsPlayer } from '../src/presentation/effects';
import { FakeAnimation } from './helpers/effect-fakes';

function setup(reduced = false) {
  const animations: FakeAnimation[] = [];
  const requests: { frames: Keyframe[]; timing: KeyframeAnimationOptions }[] = [];
  const player = new EffectsPlayer({
    prefersReducedMotion: () => reduced,
    animate: (_target, frames, timing) => {
      requests.push({ frames, timing });
      const animation = new FakeAnimation(); animations.push(animation); return animation;
    },
  });
  return { player, animations, requests, target: {} as HTMLElement };
}

test('effect handles distinguish cancellation from completion and preserve the replacement', async () => {
  const { player, animations, target } = setup();
  const old = player.play(target, 'fade-in');
  old.pause(); old.resume();
  assert.equal(animations[0].pauses, 1); assert.equal(animations[0].resumes, 1);
  const current = player.play(target, 'fade-out');
  assert.deepEqual(await old.finished, { status: 'cancelled' });
  animations[0].resolve();
  await Promise.resolve();
  player.cancel(target);
  assert.deepEqual(await current.finished, { status: 'cancelled' });
  assert.equal(animations[1].cancels, 1);
});

test('completed effects retain their final visual state until cancellation or disposal', async () => {
  const { player, animations, requests, target } = setup();
  const handle = player.play(target, 'slide-up', { durationMs: 150, easing: 'linear' });
  animations[0].resolve();
  assert.deepEqual(await handle.finished, { status: 'completed' });
  assert.equal(requests[0].timing.duration, 150);
  assert.equal(requests[0].timing.easing, 'linear');
  assert.equal(requests[0].timing.fill, 'both');
  assert.equal(animations[0].cancels, 0);
  player.dispose();
  assert.equal(animations[0].cancels, 1);
  assert.deepEqual(await player.play(target, 'fade-in').finished, { status: 'cancelled' });
  assert.equal(animations.length, 1);
});

test('reduced motion applies only the final frame and completes without waiting for a clock', async () => {
  const { player, requests, animations, target } = setup(true);
  assert.deepEqual(await player.play(target, 'slide-up').finished, { status: 'completed' });
  assert.equal(requests[0].timing.duration, 0);
  assert.deepEqual(requests[0].frames, [{ opacity: 1, translate: '0 0' }]);
  assert.equal(animations[0].finishes, 1);
  player.dispose();
});

test('disposing cancels every target and invalid duration does not replace an existing effect', async () => {
  const { player, animations, target } = setup();
  const first = player.play(target, 'fade-in');
  const second = player.play({} as HTMLElement, 'fade-out');
  assert.throws(() => player.play(target, 'fade-in', { durationMs: Infinity }), /durationMs/);
  assert.equal(animations[0].cancels, 0);
  player.dispose(); player.dispose();
  assert.deepEqual(await Promise.all([first.finished, second.finished]), [{ status: 'cancelled' }, { status: 'cancelled' }]);
  assert.deepEqual(animations.map((animation) => animation.cancels), [1, 1]);
});

test('reentrant native cancellation cannot overwrite a more recent effect', async () => {
  const { player, animations, target } = setup();
  player.play(target, 'fade-in');
  let nested: ReturnType<EffectsPlayer['play']> | undefined;
  animations[0].onCancel = () => { nested = player.play(target, 'slide-up'); };
  const stale = player.play(target, 'fade-out');
  assert.deepEqual(await stale.finished, { status: 'cancelled' });
  assert.equal(animations.length, 2);
  animations[1].resolve();
  assert.deepEqual(await nested!.finished, { status: 'completed' });
  player.dispose();
});

test('disposal inside an injected animation factory or immediate finish cancels its result', async () => {
  for (const duringFinish of [false, true]) {
    const animation = new FakeAnimation();
    const player = new EffectsPlayer({ prefersReducedMotion: () => duringFinish, animate: () => {
      if (duringFinish) animation.onFinish = () => player.dispose();
      else player.dispose();
      return animation;
    } });
    assert.deepEqual(await player.play({} as HTMLElement, 'fade-in').finished, { status: 'cancelled' });
    assert.equal(animation.cancels, 1);
  }
});
