import type { EffectAnimation, EffectHandle, EffectResult } from './types';

export function cancelledEffect(): EffectHandle {
  return { finished: Promise.resolve({ status: 'cancelled' }), cancel() {}, pause() {}, resume() {} };
}

export function animationHandle(
  animation: EffectAnimation, release: () => void, immediate: boolean, canComplete: () => boolean,
): EffectHandle {
  let settled = false;
  let cancelled = false;
  let resolve!: (result: EffectResult) => void;
  const finished = new Promise<EffectResult>((done) => { resolve = done; });
  const settle = (status: EffectResult['status']) => {
    if (settled) return;
    settled = true;
    resolve({ status });
  };
  const handle: EffectHandle = {
    finished,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      try { animation.cancel(); }
      finally { settle('cancelled'); release(); }
    },
    pause() { if (!settled && !cancelled) animation.pause(); },
    resume() { if (!settled && !cancelled) animation.play(); },
  };
  // Consume native cancellation rejections; callers always receive a resolved result.
  void animation.finished.then(() => {
    if (cancelled) return;
    if (canComplete()) settle('completed');
    else handle.cancel();
  }, () => handle.cancel());
  if (immediate) {
    animation.finish?.();
    if (canComplete()) settle('completed');
    else handle.cancel();
  }
  return handle;
}
