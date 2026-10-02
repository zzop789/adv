import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import WorkUI from '@work-ui';
import { VideoController } from '../presentation/video-controller';
import { StorySession } from '../runtime/session';
import type { LoadedGame, PlaybackActions, StoryActions } from '../runtime/types';
import './shell.css';

function Player({ content }: { content: LoadedGame }) {
  const videoHostRef = useRef<HTMLDivElement>(null);
  const [{ video, session }] = useState(() => {
    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-label', '演出视频');
    video.disablePictureInPicture = true;
    return { video, session: new StorySession(content.story, content.game.entryNodeId, content.videoUrls, new VideoController(video)) };
  });
  const { story, playback } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    videoHostRef.current?.append(video);
    return () => { session.dispose(); video.remove(); };
  }, [session, video]);

  const actions = useMemo<PlaybackActions>(() => ({
    play: () => session.play(),
    pause: () => session.pause(),
    replay: () => session.replayCurrent(),
    seek: (time) => session.seek(time),
    setVolume: (volume) => session.setVolume(volume),
    toggleFullscreen: () => { void window.adv.getFullscreen().then((current) => window.adv.setFullscreen(!current)).catch(console.error); },
    retry: () => session.retry(),
  }), [session]);
  const storyActions = useMemo<StoryActions>(() => ({
    choose: (optionId, visitId) => session.choose(optionId, visitId),
    restart: () => session.restart(),
  }), [session]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void window.adv.setFullscreen(false).catch(console.error);
        return;
      }
      const target = event.target as HTMLElement;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || target.closest('button,input,select,textarea,[contenteditable]')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (['playing', 'loading'].includes(session.getSnapshot().playback.status)) session.pause();
        else session.play();
      } else if (event.key.toLowerCase() === 'f') {
        actions.toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [actions, session]);

  return <WorkUI game={content.game} playback={playback} actions={actions} story={story} storyActions={storyActions} videoHostRef={videoHostRef} />;
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
