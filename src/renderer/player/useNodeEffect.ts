import { useEffect, useRef, type RefObject } from 'react';
import { EffectsPlayer, type EffectHandle } from '../../presentation/effects';
import type { SessionSnapshot } from '../../runtime/types';

export function useNodeEffect(
  snapshot: SessionSnapshot,
  videoHost: RefObject<HTMLDivElement | null>,
  storyHost: RefObject<HTMLDivElement | null>,
  suspended: boolean,
  storyScreenId: number | null,
) {
  const player = useRef<EffectsPlayer | null>(null);
  const active = useRef<EffectHandle | null>(null);
  const effect = snapshot.story.node.effect;
  useEffect(() => {
    const effects = new EffectsPlayer();
    player.current = effects;
    return () => {
      effects.dispose();
      player.current = null;
    };
  }, []);
  useEffect(() => {
    active.current?.cancel();
    active.current = null;
    const target = snapshot.story.node.type === 'video' ? videoHost.current : storyHost.current?.firstElementChild as HTMLElement | null;
    if (target && effect && effect.preset !== 'none') {
      active.current = player.current?.play(target, effect.preset === 'fade' ? 'fade-in' : 'slide-up', { durationMs: effect.durationMs }) ?? null;
    }
    return () => {
      active.current?.cancel();
      active.current = null;
    };
    // The presenter mounts choice/end screens after its own first effect. Their
    // instance identity makes us run again after the actual target is committed.
  }, [snapshot.story.visitId, storyScreenId, effect?.preset, effect?.durationMs, videoHost, storyHost]);
  useEffect(() => {
    const paused = suspended || (snapshot.story.node.type === 'video'
      && ['paused', 'ready', 'loading', 'buffering', 'idle', 'error'].includes(snapshot.playback.status));
    if (paused) active.current?.pause(); else active.current?.resume();
  }, [suspended, storyScreenId, snapshot.playback.status, snapshot.story.visitId, snapshot.story.node.type]);
}
