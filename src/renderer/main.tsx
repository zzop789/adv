import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import WorkUI from '@work-ui';
import { VideoController } from '../presentation/video-controller';
import { StorySession } from '../runtime/session';
import type { LoadedGame } from '../runtime/types';
import type { WorkLayoutProps } from '../ui/contracts';
import { UIHost, UIOutlet } from '../ui/UIHost';
import { bindPlayerUI, createPlayerUI } from '../ui/player-ui';
import { SettingsScreen } from '../ui/screens/SettingsScreen';
import './shell.css';
import '../ui/ui.css';

const screens = { ...WorkUI.screens, settings: WorkUI.screens.settings ?? SettingsScreen };
const Layout = WorkUI.Layout;

function Player({ content }: { content: LoadedGame }) {
  const videoHostRef = useRef<HTMLDivElement>(null);
  const presenter = useRef<ReturnType<typeof bindPlayerUI> | null>(null);
  const [{ video, session, ui }] = useState(() => {
    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-label', '演出视频');
    video.disablePictureInPicture = true;
    return { video, ui: createPlayerUI(), session: new StorySession(content.story, content.game.entryNodeId, content.videoUrls, new VideoController(video)) };
  });
  const { story, playback } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const actions = useMemo<WorkLayoutProps['actions']>(() => ({
    play: () => session.play(),
    pause: () => session.pause(),
    replay: () => session.replayCurrent(),
    seek: (time) => session.seek(time),
    setVolume: (volume) => session.setVolume(volume),
    toggleFullscreen: () => { void window.adv.getFullscreen().then((current) => window.adv.setFullscreen(!current)).catch(console.error); },
    retry: () => session.retry(),
    togglePlayback: () => {
      if (['playing', 'loading'].includes(session.getSnapshot().playback.status)) session.pause();
      else session.play();
    },
  }), [session]);
  useEffect(() => {
    videoHostRef.current?.append(video);
    presenter.current = bindPlayerUI(ui, session, content.game, actions);
    return () => { presenter.current?.dispose(); presenter.current = null; ui.dispose(); session.dispose(); video.remove(); };
  }, [session, video, ui, content.game, actions]);
  const openSettings = useCallback(() => presenter.current?.openSettings(), []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (ui.getSnapshot().entries.some((entry) => entry.layer === 'modal')) {
        if (event.key === 'Escape') { event.preventDefault(); ui.closeTop('modal'); }
        return;
      }
      if (event.key === 'Escape') {
        void window.adv.setFullscreen(false).catch(console.error);
        return;
      }
      const target = event.target as HTMLElement;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || target.closest('button,input,select,textarea,[contenteditable]')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        actions.togglePlayback();
      } else if (event.key.toLowerCase() === 'f') {
        actions.toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [actions, ui]);

  return <UIHost manager={ui} screens={screens}>
    <Layout game={content.game} playback={playback} actions={actions} storyKind={story.node.type}
      videoHostRef={videoHostRef} openSettings={openSettings}
      slots={{ playback: <UIOutlet layer="playback" />, story: <UIOutlet layer="story" />, modal: <UIOutlet layer="modal" topOnly /> }} />
  </UIHost>;
}

function App() {
  const [content, setContent] = useState<LoadedGame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!window.adv) throw new Error('请通过桌面程序启动作品。');
      const result = await window.adv.loadGame();
      if (!result.ok) throw new Error(result.error);
      document.title = result.value.game.title;
      setContent(result.value);
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法读取作品。');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (content) return <Player content={content} />;
  return <main className="adv-shell-state">
    <span className="adv-shell-eyebrow">ADV / LOCAL CINEMA</span>
    <h1>{loading ? '正在准备演出' : '暂时无法打开作品'}</h1>
    <p role={error ? 'alert' : undefined}>{error ?? '正在读取本地内容。'}</p>
    {error && <button onClick={() => void load()}>重新加载</button>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
