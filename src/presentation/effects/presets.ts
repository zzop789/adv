import type { EffectPreset } from './types';

export function effectFrames(preset: EffectPreset): Keyframe[] {
  switch (preset) {
    case 'fade-in': return [{ opacity: 0 }, { opacity: 1 }];
    case 'fade-out': return [{ opacity: 1 }, { opacity: 0 }];
    // Individual translate leaves a work's transform (rotation/scaling) untouched.
    case 'slide-up': return [{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }];
    default: throw new Error(`未知动效预设：${String(preset)}`);
  }
}

export function systemReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
