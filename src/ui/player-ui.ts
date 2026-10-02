import type { StorySession } from '../runtime/session';
import type { GameInfo, PlaybackActions, SessionSnapshot } from '../runtime/types';
import type { UIScreenParams } from './contracts';
import { UIManager, type UIHandle } from './ui-manager';

export function createPlayerUI() {
  return new UIManager<UIScreenParams>({
    playback: { layer: 'playback' },
    choice: { layer: 'story' },
    ending: { layer: 'story' },
    settings: { layer: 'modal' },
  });
}

/** The application presenter binds story rules to plain UI props. Screens stay independent. */
export function bindPlayerUI(
  ui: UIManager<UIScreenParams>,
  session: Pick<StorySession, 'getSnapshot' | 'subscribe' | 'play' | 'pause' | 'choose' | 'restart' | 'setVolume'>,
  game: GameInfo,
  actions: PlaybackActions & { togglePlayback(): void },
) {
  let disposed = false;
  let lastVisit = 0;
  let lastPlayback: string | null = null;
  let settings: { handle: UIHandle<UIScreenParams, 'settings'> | null; closeRequested: boolean; onClose(): void } | null = null;
  let settingsVolume = Number.NaN;
  let blocked = false;
  let resume: { visitId: number; sourceId: number } | null = null;
  let syncing = false;
  let syncPending = false;

  const syncSettings = () => {
    const volume = session.getSnapshot().playback.volume;
    if (settings?.handle && volume !== settingsVolume) {
      settingsVolume = volume;
      if (!settings.handle.update(settingsProps(settings.onClose))) settings = null;
    }
  };
  const settingsProps = (onClose: () => void): UIScreenParams['settings'] => {
    return {
      volume: session.getSnapshot().playback.volume,
      onVolumeChange: (value) => session.setVolume(value),
      onFullscreen: actions.toggleFullscreen,
      onClose,
    };
  };
  const reconcile = () => {
    if (disposed) return;
    const { story, playback } = session.getSnapshot();
    if (blocked) {
      if (resume && (resume.visitId !== story.visitId || resume.sourceId !== playback.sourceId || playback.status === 'error')) resume = null;
      if (story.node.type === 'video' && ['playing', 'loading'].includes(playback.status)) {
        session.pause();
        return;
      }
    }
    if (lastVisit !== story.visitId) {
      lastVisit = story.visitId;
      ui.closeLayer('story');
      if (disposed) return;
      const node = story.node;
      if (node.type === 'choice') {
        ui.show('choice', { prompt: node.prompt, options: node.options,
          onChoose: (id) => { session.choose(id, story.visitId); } });
      } else if (node.type === 'end') {
        ui.show('ending', { title: node.title, description: node.description, onRestart: () => session.restart() });
      }
      if (disposed) return;
    }
    const playbackKey = story.node.type === 'video' && playback.status !== 'playing'
      ? JSON.stringify([story.visitId, playback.status, playback.error]) : null;
    if (lastPlayback !== playbackKey) {
      lastPlayback = playbackKey;
      if (playbackKey === null) ui.closeLayer('playback');
      else ui.show('playback', { title: game.title, status: playback.status, error: playback.error,
        onPlay: actions.togglePlayback, onRetry: actions.retry });
    }
    if (disposed) return;
    syncSettings();
  };
  const sync = () => {
    if (disposed) return;
    syncPending = true;
    if (syncing) return;
    syncing = true;
    try {
      // UI observers can change the session synchronously. Reconcile again from its
      // latest snapshot instead of letting nested passes leave stale screens behind.
      while (syncPending && !disposed) {
        syncPending = false;
        reconcile();
      }
    } finally { syncing = false; }
  };
  const unsubscribeSession = session.subscribe(sync);
  const syncModal = () => {
    const nextBlocked = ui.getSnapshot().entries.some((entry) => entry.layer === 'modal');
    if (nextBlocked === blocked || disposed) return;
    blocked = nextBlocked;
    const snapshot: SessionSnapshot = session.getSnapshot();
    if (blocked) {
      if (snapshot.story.node.type === 'video' && ['playing', 'loading'].includes(snapshot.playback.status)) {
        resume = { visitId: snapshot.story.visitId, sourceId: snapshot.playback.sourceId };
        session.pause();
      }
    } else {
      const previous = resume;
      resume = null;
      if (previous && snapshot.story.visitId === previous.visitId && snapshot.playback.sourceId === previous.sourceId
        && snapshot.story.node.type === 'video' && snapshot.playback.status === 'paused') session.play();
    }
  };
  const unsubscribeUI = ui.subscribe(syncModal);
  syncModal();
  sync();

  return {
    openSettings() {
      if (disposed) return;
      // Use the returned handle so an old screen's close callback cannot close a later instance.
      settingsVolume = session.getSnapshot().playback.volume;
      const request: NonNullable<typeof settings> = { handle: null, closeRequested: false, onClose: () => {
        if (request.handle) request.handle.close();
        else request.closeRequested = true;
      } };
      settings = request;
      request.handle = ui.open('settings', settingsProps(request.onClose));
      // A synchronous observer is allowed to dismiss a screen as soon as it opens.
      if (request.closeRequested) request.handle.close();
      if (!disposed && settings === request) syncSettings();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeSession();
      unsubscribeUI();
      settings = null;
      resume = null;
    },
  };
}
