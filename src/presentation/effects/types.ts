export type EffectPreset = 'fade-in' | 'fade-out' | 'slide-up';
export type EffectResult = { status: 'completed' | 'cancelled' };

export interface EffectHandle {
  readonly finished: Promise<EffectResult>;
  cancel(): void;
  pause(): void;
  resume(): void;
}

export interface EffectOptions {
  durationMs?: number;
  easing?: string;
}

/** Minimal Web Animations contract, allowing tests without a DOM or a real clock. */
export interface EffectAnimation {
  readonly finished: Promise<unknown>;
  cancel(): void;
  pause(): void;
  play(): void;
  finish?(): void;
}

export interface EffectsPlayerOptions {
  animate?: (target: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => EffectAnimation;
  prefersReducedMotion?: () => boolean;
}

export interface MediaClock {
  sourceId: number;
  currentTime: number;
  status: 'idle' | 'ready' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';
  /** Set for a deliberate seek; a large normal timeupdate is not implicitly a seek. */
  seeking?: boolean;
}

export interface MediaCue {
  id: string;
  at: number;
  run(): void | EffectHandle;
}

export interface CueSchedulerOptions {
  cues: readonly MediaCue[];
  seek?: 'skip' | 'fire-crossed';
  rewind?: 'once-per-source' | 'rearm';
}
