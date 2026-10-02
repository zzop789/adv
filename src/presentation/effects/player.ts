import { animationHandle, cancelledEffect } from './handle';
import { effectFrames, systemReducedMotion } from './presets';
import type { EffectHandle, EffectOptions, EffectPreset, EffectsPlayerOptions } from './types';

/** One visual effect per target. It never controls media or advances a story. */
export class EffectsPlayer {
  private readonly effects = new Map<HTMLElement, EffectHandle>();
  private readonly versions = new Map<HTMLElement, number>();
  private readonly animate: NonNullable<EffectsPlayerOptions['animate']>;
  private readonly reducedMotion: () => boolean;
  private disposed = false;
  private sequence = 0;

  constructor(options: EffectsPlayerOptions = {}) {
    this.animate = options.animate ?? ((target, frames, timing) => target.animate(frames, timing));
    this.reducedMotion = options.prefersReducedMotion ?? systemReducedMotion;
  }

  play(target: HTMLElement, preset: EffectPreset, options: EffectOptions = {}): EffectHandle {
    if (this.disposed) return cancelledEffect();
    const duration = options.durationMs ?? 240;
    if (!Number.isFinite(duration) || duration < 0) throw new Error('动效 durationMs 必须是非负有限数值。');
    const easing = options.easing ?? 'ease-out';
    const frames = effectFrames(preset);
    const immediate = duration === 0 || this.reducedMotion();
    const version = ++this.sequence;
    this.versions.set(target, version);
    this.effects.get(target)?.cancel();
    if (!this.isCurrent(target, version)) return cancelledEffect();
    const animation = this.animate(target, immediate ? [frames[frames.length - 1]] : frames, {
      duration: immediate ? 0 : duration, easing, fill: 'both',
    });
    let handle!: EffectHandle;
    handle = animationHandle(animation, () => {
      if (this.effects.get(target) === handle) this.effects.delete(target);
      if (this.versions.get(target) === version) this.versions.delete(target);
    }, immediate && this.isCurrent(target, version), () => this.isCurrent(target, version));
    if (!this.isCurrent(target, version)) { handle.cancel(); return handle; }
    this.effects.set(target, handle);
    return handle;
  }

  cancel(target: HTMLElement): void {
    this.versions.delete(target);
    this.effects.get(target)?.cancel();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.versions.clear();
    for (const handle of [...this.effects.values()]) handle.cancel();
    this.effects.clear();
  }

  private isCurrent(target: HTMLElement, version: number): boolean {
    return !this.disposed && this.versions.get(target) === version;
  }
}
