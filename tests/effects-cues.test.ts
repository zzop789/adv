import test from 'node:test';
import assert from 'node:assert/strict';
import { CueScheduler, type MediaClock } from '../src/presentation/effects';
import { fakeEffect } from './helpers/effect-fakes';

const clock = (currentTime: number, status: MediaClock['status'] = 'playing', sourceId = 1): MediaClock => ({ sourceId, currentTime, status });

test('cues follow media time once, while paused and buffering snapshots never dispatch them', () => {
  const calls: string[] = [];
  const effect = fakeEffect();
  const cues = new CueScheduler({ cues: [
    { id: 'zero', at: 0, run: () => { calls.push('zero'); return effect; } },
    { id: 'middle', at: .5, run: () => { calls.push('middle'); } },
    { id: 'later', at: 1, run: () => { calls.push('later'); } },
  ] });
  cues.update(clock(0)); cues.update(clock(.1, 'paused')); cues.update(clock(.8, 'buffering'));
  assert.deepEqual(calls, ['zero']); assert.equal(effect.pauses, 2);
  cues.update(clock(1.1)); cues.update(clock(1.1));
  assert.deepEqual(calls, ['zero', 'later']);
  assert.ok(effect.resumes > 0);
  cues.dispose(); assert.equal(effect.cancels, 1);
});

test('normal sparse time updates fire crossed cues in timestamp order and end includes the final boundary', () => {
  const calls: number[] = [];
  const cues = new CueScheduler({ cues: [2, 1, 3].map((at) => ({ id: String(at), at, run: () => { calls.push(at); } })) });
  cues.update(clock(0)); cues.update(clock(2.2)); cues.update(clock(3, 'ended')); cues.update(clock(3, 'ended'));
  assert.deepEqual(calls, [1, 2, 3]); cues.dispose();
});

test('explicit seek skips crossed cues by default and can opt into firing them', () => {
  for (const seek of ['skip', 'fire-crossed'] as const) {
    const calls: number[] = [];
    const cues = new CueScheduler({ seek, cues: [1, 2].map((at) => ({ id: String(at), at, run: () => { calls.push(at); } })) });
    cues.update(clock(0)); cues.update({ ...clock(3), seeking: true });
    assert.deepEqual(calls, seek === 'skip' ? [] : [1, 2]);
    cues.dispose();
  }
});

test('rewind cancels old visuals and can either retain or rearm per-source cue history', () => {
  for (const rewind of ['once-per-source', 'rearm'] as const) {
    const effects: ReturnType<typeof fakeEffect>[] = [];
    const cues = new CueScheduler({ rewind, cues: [{ id: 'one', at: 1, run: () => {
      const effect = fakeEffect(); effects.push(effect); return effect;
    } }] });
    cues.update(clock(0)); cues.update(clock(1)); cues.update(clock(0)); cues.update(clock(1));
    assert.equal(effects[0].cancels, 1);
    assert.equal(effects.length, rewind === 'rearm' ? 2 : 1);
    cues.dispose();
  }
});

test('source switches cancel prior effects and reset history without replaying cues before the initial position', () => {
  const effects: ReturnType<typeof fakeEffect>[] = [];
  const cues = new CueScheduler({ cues: [{ id: 'one', at: 1, run: () => {
    const effect = fakeEffect(); effects.push(effect); return effect;
  } }] });
  cues.update(clock(5)); assert.equal(effects.length, 0);
  cues.update(clock(0, 'playing', 2)); cues.update(clock(1, 'playing', 2));
  cues.update(clock(0, 'playing', 3)); assert.equal(effects[0].cancels, 1);
  cues.update(clock(1, 'playing', 3)); assert.equal(effects.length, 2);
  cues.dispose(); cues.update(clock(0, 'playing', 4)); cues.update(clock(1, 'playing', 4));
  assert.equal(effects[1].cancels, 1); assert.equal(effects.length, 2);
});

test('a cue which switches source cannot attach its old effect or dispatch remaining old cues', () => {
  let later = 0;
  const old = fakeEffect();
  const cues = new CueScheduler({ cues: [
    { id: 'switch', at: 1, run: () => { cues.update(clock(0, 'paused', 2)); return old; } },
    { id: 'stale', at: 1, run: () => { later += 1; } },
  ] });
  cues.update(clock(0)); cues.update(clock(1));
  assert.equal(old.cancels, 1); assert.equal(later, 0); cues.dispose();
});

test('source changes reentered during cleanup preserve the newer source state', () => {
  let runs = 0;
  const cues = new CueScheduler({ cues: [{ id: 'start', at: 0, run: () => {
    runs += 1;
    return fakeEffect(runs === 1 ? () => cues.update(clock(0, 'paused', 3)) : undefined);
  } }] });
  cues.update(clock(0)); cues.update(clock(0, 'playing', 2));
  assert.equal(runs, 1);
  cues.update(clock(0, 'playing', 3)); assert.equal(runs, 2);
  cues.dispose();
});

test('one failing cue does not suppress other crossed cues and invalid cue definitions are rejected', () => {
  let calls = 0;
  const cues = new CueScheduler({ cues: [
    { id: 'bad', at: 1, run: () => { throw new Error('cue failure'); } },
    { id: 'good', at: 1, run: () => { calls += 1; } },
  ] });
  cues.update(clock(0)); assert.throws(() => cues.update(clock(1)), /cue failure/);
  assert.equal(calls, 1); cues.dispose();
  assert.throws(() => new CueScheduler({ cues: [{ id: 'a', at: NaN, run() {} }] }), /秒数/);
  assert.throws(() => new CueScheduler({ cues: [{ id: 'a', at: 0, run() {} }, { id: 'a', at: 1, run() {} }] }), /唯一/);
});
