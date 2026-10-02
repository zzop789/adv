import { useEffect } from 'react';
import type { LoadedGame } from '../../runtime/types';
import type { StorySession } from '../../runtime/session';
import type { PreviewController } from '../preview-controller';

/** Keep the latest graph and the currently displayed video lease; prune all others. */
export function useContentLeases(preview: PreviewController, session: StorySession, video: HTMLVideoElement, initial: LoadedGame) {
  useEffect(() => {
    let current = initial;
    const leases = new Map([[initial.loadId, initial]]);
    preview.mount(initial.loadId);
    const prune = () => {
      for (const [id, content] of leases) {
        if (id !== current.loadId && !Object.values(content.videoUrls).includes(video.src)) {
          leases.delete(id); preview.unmount(id);
        }
      }
    };
    const unsubscribe = session.subscribe(prune);
    const uninstall = preview.setInstaller((content, options) => {
      const result = session.applyContent({ story: content.story, entryNodeId: content.game.entryNodeId,
        mediaUrls: content.videoUrls, mediaRevisions: content.mediaRevisions }, options);
      if (result.ok) {
        current = content; leases.set(content.loadId, content); preview.mount(content.loadId); prune();
      }
      return result;
    });
    return () => {
      uninstall(); unsubscribe();
      // Player's earlier effect removes media before this effect releases its leases.
      for (const id of leases.keys()) preview.unmount(id);
    };
  }, [preview, session, video, initial]);
}
