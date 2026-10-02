import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import DemoUI from '../../games/demo/ui';
import { VideoController } from '../presentation/video-controller';
import type { LoadedGame, PlaybackActions } from '../runtime/types';
import './shell.css';

function Player({ content }: { content: LoadedGame }) {
  const videoHostRef = useRef<HTMLDivElement>(null);
  const [{ video, controller }] = useState(() => {
    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-label', '演出视频');
    video.disablePictureInPicture = true;
    return { video, controller: new VideoController(video) };
  });
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  const playback = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    videoHostRef.current?.append(video);
    controller.load(content.entryVideoUrl);
    return () => { controller.dispose(); video.remove(); };
  }, [content.entryVideoUrl, controller, video]);

  const actions = useMemo<PlaybackActions>(() => ({
    play: () => { void controller.play(); },
    pause: () => controller.pause(),
    replay: () => { void controller.replay(); },
    seek: (time) => controller.seek(time),
    setVolume: (volume) => controller.setVolume(volume),
    toggleFullscreen: () => { void window.adv.getFullscreen().then((current) => window.adv.setFullscreen(!current)).catch(console.error); },
    retry: () => controller.load(content.entryVideoUrl),
  }), [controller, content.entryVideoUrl]);

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
        if (['playing', 'loading'].includes(controller.getSnapshot().status)) controller.pause();
        else void controller.play();
      } else if (event.key.toLowerCase() === 'f') {
        actions.toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [actions, controller]);

  return <DemoUI game={content.game} playback={playback} actions={actions} videoHostRef={videoHostRef} />;
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
