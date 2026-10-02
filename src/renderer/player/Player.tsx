import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import WorkUI from '@work-ui';
import { VideoController } from '../../presentation/video-controller';
import { StorySession } from '../../runtime/session';
import type { LoadedGame } from '../../runtime/types';
import type { WorkLayoutProps } from '../../ui/contracts';
import { UIHost, UIOutlet } from '../../ui/UIHost';
import { bindPlayerUI, createPlayerUI } from '../../ui/player-ui';
import { SettingsScreen } from '../../ui/screens/SettingsScreen';
import type { PreviewController } from '../preview';
import { useContentLeases } from './useContentLeases';
import { useEditorPause, usePlayerInput } from './usePlayerInput';
import { useNodeEffect } from './useNodeEffect';

const screens = { ...WorkUI.screens, settings: WorkUI.screens.settings ?? SettingsScreen };
const Layout = WorkUI.Layout;

export default function Player({ content, preview, editorOpen }: { content: LoadedGame; preview: PreviewController; editorOpen: boolean }) {
  const videoHostRef = useRef<HTMLDivElement>(null);
  const storyHostRef = useRef<HTMLDivElement>(null);
  const presenter = useRef<ReturnType<typeof bindPlayerUI> | null>(null);
  const [{ video, session, ui, initial }] = useState(() => {
    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('aria-label', '演出视频');
    return {
      video,
      ui: createPlayerUI(),
      initial: content,
      session: new StorySession(content.story, content.game.entryNodeId, content.videoUrls,
        new VideoController(video), content.mediaRevisions),
    };
  });
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const uiSnapshot = useSyncExternalStore(ui.subscribe, ui.getSnapshot);
  const modal = uiSnapshot.entries.some((entry) => entry.layer === 'modal');
  const storyScreenId = uiSnapshot.entries.find((entry) => entry.layer === 'story')?.instanceId ?? null;
  const actions = useMemo<WorkLayoutProps['actions']>(() => ({
    play: () => session.play(),
    pause: () => session.pause(),
    replay: () => session.replayCurrent(),
    seek: (time) => session.seek(time),
    setVolume: (volume) => session.setVolume(volume),
    retry: () => session.retry(),
    toggleFullscreen: () => {
      void window.adv.getFullscreen().then((current) => window.adv.setFullscreen(!current)).catch(console.error);
    },
    togglePlayback: () => {
      if (['playing', 'loading'].includes(session.getSnapshot().playback.status)) session.pause();
      else session.play();
    },
  }), [session]);
  useEffect(() => {
    videoHostRef.current?.append(video);
    return () => {
      presenter.current?.dispose();
      presenter.current = null;
      ui.dispose();
      session.dispose();
      video.remove();
    };
  }, [video, session, ui]);
  useContentLeases(preview, session, video, initial);
  useEffect(() => {
    presenter.current = bindPlayerUI(ui, session, initial.game, actions);
    return () => {
      presenter.current?.dispose();
      presenter.current = null;
    };
  }, [ui, session, initial, actions]);
  useEffect(() => {
    presenter.current?.updateGame(content.game);
  }, [content.game]);
  const openSettings = useCallback(() => presenter.current?.openSettings(), []);
  usePlayerInput(ui, actions, editorOpen);
  useEditorPause(session, editorOpen);
  useNodeEffect(snapshot, videoHostRef, storyHostRef, editorOpen || modal, storyScreenId);
  return <UIHost manager={ui} screens={screens}>
    <Layout game={content.game} playback={snapshot.playback} actions={actions} storyKind={snapshot.story.node.type}
      videoHostRef={videoHostRef} openSettings={openSettings} slots={{ playback: <UIOutlet layer="playback" />,
        story: <div ref={storyHostRef} className="adv-story-effect-host"><UIOutlet layer="story" /></div>,
        modal: <UIOutlet layer="modal" topOnly /> }} />
  </UIHost>;
}
