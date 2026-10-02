import { useEffect } from 'react';
import type { WorkLayoutProps } from '../../ui/contracts';
import type { createPlayerUI } from '../../ui/player-ui';
import type { StorySession } from '../../runtime/session';

export function usePlayerInput(ui: ReturnType<typeof createPlayerUI>, actions: WorkLayoutProps['actions'], editorOpen: boolean) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (editorOpen) return;
      if (ui.getSnapshot().entries.some((entry) => entry.layer === 'modal')) {
        if (event.key === 'Escape') { event.preventDefault(); ui.closeTop('modal'); }
        return;
      }
      if (event.key === 'Escape') { void window.adv.setFullscreen(false).catch(console.error); return; }
      const target = event.target as HTMLElement;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || target.closest('button,input,select,textarea,[contenteditable]')) return;
      if (event.code === 'Space') { event.preventDefault(); actions.togglePlayback(); }
      else if (event.key.toLowerCase() === 'f') actions.toggleFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ui, actions, editorOpen]);
}

export function useEditorPause(session: StorySession, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const before = session.getSnapshot();
    const resume = ['playing', 'loading'].includes(before.playback.status);
    if (resume) session.pause();
    return () => {
      const now = session.getSnapshot();
      if (resume && now.story.node.type === 'video'
        && now.playback.sourceId === before.playback.sourceId
        && now.playback.status === 'paused') session.play();
    };
  }, [session, open]);
}
