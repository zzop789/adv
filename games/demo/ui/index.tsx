import type { CSSProperties, RefObject } from 'react';
import type {
  GameInfo,
  PlaybackActions,
  PlaybackSnapshot,
} from '../../../src/runtime/types';
import { Button } from '../../../src/ui-base/Button';
import './styles.css';

interface DemoUIProps {
  game: GameInfo;
  playback: PlaybackSnapshot;
  actions: PlaybackActions;
  videoHostRef: RefObject<HTMLDivElement | null>;
}

const statusLabels: Record<PlaybackSnapshot['status'], string> = {
  idle: '等待开始',
  loading: '正在载入',
  ready: '准备就绪',
  playing: '正在播放',
  paused: '已暂停',
  ended: '播放结束',
  error: '播放遇到问题',
};

function formatTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(value / 60);
  return `${minutes.toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}

function rangeStyle(value: number): CSSProperties {
  return { '--adv-progress': `${Math.min(100, Math.max(0, value))}%` } as CSSProperties;
}

export default function DemoUI({
  game,
  playback,
  actions,
  videoHostRef,
}: DemoUIProps) {
  const { status, duration, currentTime, volume, muted } = playback;
  const isPlaying = status === 'playing' || status === 'loading';
  const unavailable = status === 'error' || status === 'idle';
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const visibleVolume = muted ? 0 : volume;
  const togglePlayback = () => {
    if (isPlaying) actions.pause();
    else if (status === 'ended') actions.replay();
    else actions.play();
  };

  return (
    <main className="demo-shell">
      <header className="demo-header">
        <div className="demo-brand" aria-label="ADV 作品演示">
          <span className="demo-brand-mark" aria-hidden="true">A</span>
          <span>ADV <span className="demo-brand-light">/</span> CINEMA</span>
        </div>
        <span className="demo-local"><span aria-hidden="true" /> 本地播放</span>
      </header>

      <section className="demo-work" aria-labelledby="demo-work-title">
        <div className="demo-work-heading">
          <div>
            <p className="demo-eyebrow">{game.subtitle || '一个故事，从这里开始'}</p>
            <h1 id="demo-work-title">{game.title}</h1>
          </div>
          <p className="demo-description">{game.description}</p>
        </div>

        <div className="demo-player">
          <div className="demo-screen" aria-label="影片画面">
            <div ref={videoHostRef} className="demo-video-host" />

            {status !== 'playing' && (
              <div className={`demo-overlay demo-overlay--${status}`}>
                <div className="demo-overlay-content">
                  {status === 'loading' || status === 'idle' ? (
                    <>
                      <span className="demo-spinner" aria-hidden="true" />
                      <p className="demo-screen-message" role="status">正在准备影片</p>
                    </>
                  ) : status === 'error' ? (
                    <>
                      <span className="demo-overlay-kicker">暂时无法播放</span>
                      <h2>影片未能载入</h2>
                      <p className="demo-error-message" role="alert">
                        {playback.error || '请确认影片文件完整，然后重试。'}
                      </p>
                      <Button appearance="primary" onClick={actions.retry}>重新载入</Button>
                    </>
                  ) : (
                    <>
                      <span className="demo-overlay-kicker">
                        {status === 'paused' ? '故事稍作停留' : status === 'ended' ? '本段播放结束' : '序幕 · 即将开始'}
                      </span>
                      <h2>{status === 'ready' ? game.title : status === 'paused' ? '准备好继续了吗' : '感谢观看'}</h2>
                      <Button appearance="primary" onClick={togglePlayback}>
                        <span className="demo-play-icon" aria-hidden="true" />
                        {status === 'paused' ? '继续播放' : status === 'ended' ? '重新观看' : '开始播放'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="demo-controls" aria-label="播放控制">
            <div className="demo-timeline">
              <span className="demo-time">{formatTime(currentTime)}</span>
              <input
                className="demo-range demo-seek"
                type="range"
                min="0"
                max={duration > 0 ? duration : 1}
                step="0.1"
                value={Math.min(currentTime, duration > 0 ? duration : 1)}
                disabled={unavailable || duration <= 0}
                style={rangeStyle(progress)}
                onChange={(event) => actions.seek(Number(event.currentTarget.value))}
                aria-label="播放进度"
                aria-valuetext={`${formatTime(currentTime)}，总时长 ${formatTime(duration)}`}
              />
              <span className="demo-time demo-time--total">{formatTime(duration)}</span>
            </div>

            <div className="demo-controls-row">
              <div className="demo-controls-group">
                <Button onClick={togglePlayback} disabled={unavailable}>
                  <span className={isPlaying ? 'demo-pause-icon' : 'demo-play-icon'} aria-hidden="true" />
                  {isPlaying ? '暂停' : status === 'ended' ? '重播' : '播放'}
                </Button>
                <Button onClick={actions.replay} disabled={unavailable || status === 'loading'} className="demo-replay">从头播放</Button>
                <span className={`demo-playback-status demo-playback-status--${status}`}>
                  <span aria-hidden="true" />{statusLabels[status]}
                </span>
              </div>

              <div className="demo-controls-group demo-controls-group--right">
                <label className="demo-volume">
                  <span>音量</span>
                  <input
                    className="demo-range"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={visibleVolume}
                    style={rangeStyle(visibleVolume * 100)}
                    onChange={(event) => actions.setVolume(Number(event.currentTarget.value))}
                    aria-label="音量"
                    aria-valuetext={`${Math.round(visibleVolume * 100)}%`}
                  />
                </label>
                <Button onClick={actions.toggleFullscreen} aria-label="切换全屏">
                  <span className="demo-fullscreen-icon" aria-hidden="true" />
                  <span className="demo-fullscreen-label">全屏</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="demo-footer">
        <span>让故事占据此刻</span>
        <span className="demo-shortcuts"><kbd>Space</kbd> 播放 / 暂停 <span>·</span> <kbd>F</kbd> 全屏</span>
      </footer>
    </main>
  );
}
