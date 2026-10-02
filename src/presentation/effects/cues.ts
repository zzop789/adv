import type { CueSchedulerOptions, EffectHandle, MediaClock, MediaCue } from './types';

/** Timestamp cues driven by media updates, never by setTimeout or wall-clock elapsed time. */
export class CueScheduler {
  private readonly cues: readonly MediaCue[];
  private readonly seek: 'skip' | 'fire-crossed';
  private readonly rewind: 'once-per-source' | 'rearm';
  private readonly fired = new Set<string>();
  private readonly effects = new Set<EffectHandle>();
  private sourceId: number | null = null;
  private position = 0;
  private generation = 0;
  private disposed = false;

  constructor(options: CueSchedulerOptions) {
    const ids = new Set<string>();
    this.cues = options.cues.map((cue) => {
      if (!cue.id.trim() || ids.has(cue.id)) throw new Error('时间标记必须具有唯一且非空的 ID。');
      if (!Number.isFinite(cue.at) || cue.at < 0 || typeof cue.run !== 'function') throw new Error('时间标记需要非负有限秒数和 run 回调。');
      ids.add(cue.id);
      return Object.freeze({ ...cue });
    }).sort((left, right) => left.at - right.at);
    this.seek = options.seek ?? 'skip';
    this.rewind = options.rewind ?? 'once-per-source';
  }

  update(clock: MediaClock): void {
    if (this.disposed || !Number.isFinite(clock.sourceId) || !Number.isFinite(clock.currentTime)) return;
    const generation = ++this.generation;
    const current = Math.max(0, clock.currentTime);
    const changedSource = this.sourceId !== clock.sourceId;
    if (changedSource) {
      this.fired.clear();
      this.sourceId = clock.sourceId;
      this.position = current;
      this.cancelEffects();
      if (this.disposed || generation !== this.generation) return;
    }
    const previous = this.position;
    const backwards = current < previous;
    this.position = current;
    if (backwards && this.rewind === 'rearm') this.fired.clear();
    if (backwards || clock.seeking) {
      this.cancelEffects();
      if (this.disposed || generation !== this.generation) return;
    }
    const advancing = clock.status === 'playing' || clock.status === 'ended';
    for (const handle of [...this.effects]) {
      if (advancing) handle.resume();
      else handle.pause();
      if (this.disposed || generation !== this.generation) return;
    }
    if (!advancing || backwards || (clock.seeking && this.seek === 'skip')) return;
    const errors: unknown[] = [];
    for (const cue of this.cues) {
      if (this.disposed || generation !== this.generation) break;
      if (this.fired.has(cue.id) || cue.at < previous || cue.at > current) continue;
      this.fired.add(cue.id);
      try {
        const effect = cue.run();
        if (effect) {
          if (this.disposed || generation !== this.generation) effect.cancel();
          else this.effects.add(effect);
        }
      } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, '时间标记执行失败。');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.cancelEffects();
    this.fired.clear();
  }

  private cancelEffects(): void {
    const effects = [...this.effects];
    this.effects.clear();
    for (const handle of effects) handle.cancel();
  }
}
