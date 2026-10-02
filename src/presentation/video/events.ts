import type { PlaybackSnapshot } from '../../runtime/types';
import { finiteVolume, mediaError, readTiming } from './values';

interface EventContext {
  active(): boolean;
  disposed(): boolean;
  canReceive(): boolean;
  snapshot(): PlaybackSnapshot;
  publish(patch: Partial<PlaybackSnapshot>): void;
}

export function videoEvents(video: HTMLVideoElement, context: EventContext): Record<string, EventListener> {
  const timing = () => { if (context.active()) context.publish(readTiming(video)); };
  return {
    loadedmetadata: timing,
    durationchange: timing,
    timeupdate: timing,
    canplay: () => {
      if (!context.canReceive()) return;
      context.publish({ ...readTiming(video), status: video.ended ? 'ended'
        : !video.paused ? 'playing' : context.snapshot().status === 'paused' ? 'paused' : 'ready' });
    },
    playing: () => {
      if (context.canReceive() && !video.paused) context.publish({ ...readTiming(video), status: 'playing', error: null });
    },
    waiting: () => {
      if (context.canReceive() && !video.paused) context.publish({ ...readTiming(video), status: 'loading' });
    },
    pause: () => {
      if (!context.canReceive() || !video.paused) return;
      // load() can queue a pause event from the previous source.
      if (context.snapshot().status === 'loading' && video.readyState === 0) return;
      context.publish({ ...readTiming(video), status: video.ended ? 'ended' : 'paused' });
    },
    ended: () => {
      if (context.canReceive() && video.ended) context.publish({ ...readTiming(video), status: 'ended' });
    },
    error: () => {
      // A queued error from a replaced source no longer has a MediaError.
      if (context.active() && video.error) context.publish({ status: 'error', error: mediaError(video.error.code) });
    },
    volumechange: () => {
      if (!context.disposed()) context.publish({ volume: finiteVolume(video.volume), muted: video.muted });
    },
  };
}
