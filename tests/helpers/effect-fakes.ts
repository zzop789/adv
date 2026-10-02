import type { EffectAnimation, EffectHandle, EffectResult } from '../../src/presentation/effects';

export class FakeAnimation implements EffectAnimation {
  readonly finished: Promise<void>;
  resolve!: () => void;
  reject!: (reason?: unknown) => void;
  cancels = 0;
  pauses = 0;
  resumes = 0;
  finishes = 0;
  onCancel?: () => void;
  onFinish?: () => void;
  constructor() { this.finished = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); }
  cancel() { this.cancels += 1; this.onCancel?.(); this.reject(new Error('native cancellation')); }
  pause() { this.pauses += 1; }
  play() { this.resumes += 1; }
  finish() { this.finishes += 1; this.onFinish?.(); this.resolve(); }
}

export function fakeEffect(onCancel?: () => void): EffectHandle & { cancels: number; pauses: number; resumes: number } {
  let resolve!: (result: EffectResult) => void;
  const finished = new Promise<EffectResult>((done) => { resolve = done; });
  return {
    finished, cancels: 0, pauses: 0, resumes: 0,
    cancel() { this.cancels += 1; onCancel?.(); resolve({ status: 'cancelled' }); },
    pause() { this.pauses += 1; },
    resume() { this.resumes += 1; },
  };
}
