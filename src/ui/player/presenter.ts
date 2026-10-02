import type { GameInfo } from '../../runtime/types';
import { ModalPlayback } from './modal-playback';
import { PlayerSettings } from './settings';
import type { PlayerActions, PlayerSession, PlayerUIManager } from './types';

/** The binding stays alive across content updates; screens only receive props and callbacks. */
export function bindPlayerUI(ui: PlayerUIManager, session: PlayerSession, game: GameInfo, actions: PlayerActions) {
  let currentGame = { ...game };
  let disposed = false;
  let lastVisit = 0;
  let lastPlayback: string | null = null;
  let syncing = false;
  let syncPending = false;
  const settings = new PlayerSettings(ui, session, actions);
  const modal = new ModalPlayback(ui, session);

  const reconcile = () => {
    if (disposed) return;
    const snapshot = session.getSnapshot();
    if (modal.reconcile(snapshot)) return;
    const { story, playback } = snapshot;
    if (lastVisit !== story.visitId) {
      lastVisit = story.visitId;
      ui.closeLayer('story');
      if (disposed) return;
      const node = story.node;
      if (node.type === 'choice') {
        ui.show('choice', {
          prompt: node.prompt,
          options: node.options,
          onChoose: (id) => { session.choose(id, story.visitId); },
        });
      } else if (node.type === 'end') {
        ui.show('ending', {
          title: node.title,
          description: node.description,
          onRestart: () => session.restart(),
        });
      }
      if (disposed) return;
    }
    const playbackKey = story.node.type === 'video' && playback.status !== 'playing'
      ? JSON.stringify([story.visitId, playback.status, playback.error, currentGame.title]) : null;
    if (lastPlayback !== playbackKey) {
      lastPlayback = playbackKey;
      if (playbackKey === null) ui.closeLayer('playback');
      else ui.show('playback', {
        title: currentGame.title,
        status: playback.status,
        error: playback.error,
        onPlay: actions.togglePlayback,
        onRetry: actions.retry,
      });
    }
    if (!disposed) settings.sync();
  };

  const sync = () => {
    if (disposed) return;
    syncPending = true;
    if (syncing) return;
    syncing = true;
    try {
      // UI observers may synchronously change the session or game title.
      while (syncPending && !disposed) {
        syncPending = false;
        reconcile();
      }
    } finally { syncing = false; }
  };

  const unsubscribeSession = session.subscribe(sync);
  const unsubscribeUI = ui.subscribe(modal.sync);
  modal.sync();
  sync();

  return {
    openSettings() { settings.open(); },
    updateGame(nextGame: GameInfo) {
      if (disposed) return;
      currentGame = { ...nextGame };
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeSession();
      unsubscribeUI();
      settings.dispose();
      modal.dispose();
    },
  };
}
