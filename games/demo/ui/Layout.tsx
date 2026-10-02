import type { CSSProperties } from 'react';
import type { PlaybackSnapshot } from '../../../src/runtime/types';
import type { WorkLayoutProps } from '../../../src/ui/contracts';
import { Button, Slider, TimeLabel, formatTime } from '../../../src/ui-base';
import './styles.css';

const statusLabels: Record<PlaybackSnapshot['status'], string> = {
  idle: '等待开始', loading: '正在载入', ready: '准备就绪', playing: '正在播放',
  paused: '已暂停', ended: '播放结束', error: '播放遇到问题',
};

function rangeStyle(value: number): CSSProperties {
  return { '--adv-progress': `${Math.min(100, Math.max(0, value))}%` } as CSSProperties;
}

/** The video host lives in the layout; changing screens never replaces it. */
export default function Layout({ game, playback, storyKind, actions, videoHostRef, slots, openSettings }: WorkLayoutProps) {
  const isVideo = storyKind === 'video';
  const { status, duration, currentTime, volume, muted } = playback;
  const isPlaying = status === 'playing' || status === 'loading';
  const unavailable = status === 'error' || status === 'idle';
  const visibleVolume = muted ? 0 : volume;
  return (
    <main className="demo-shell">
      <header className="demo-header">
        <div className="demo-brand" aria-label="ADV 作品演示">
          <span className="demo-brand-mark" aria-hidden="true">A</span>
          <span>ADV <span className="demo-brand-light">/</span> CINEMA</span>
        </div>
        <div className="demo-header-actions">
          <span className="demo-local"><span aria-hidden="true" /> 本地播放</span>
          <Button className="demo-button demo-settings-button" onClick={openSettings}>设置</Button>
        </div>
      </header>
      <section className="demo-work" aria-labelledby="demo-work-title">
        <div className="demo-work-heading">
          <div><p className="demo-eyebrow">{game.subtitle || '一个故事，从这里开始'}</p><h1 id="demo-work-title">{game.title}</h1></div>
          <p className="demo-description">{game.description}</p>
        </div>
        <div className="demo-player">
          <div className="demo-screen" aria-label="影片画面">
            <div ref={videoHostRef} className="demo-video-host" />
            {slots.playback}
            {slots.story}
          </div>
          <div className="demo-controls" aria-label="播放控制">
            {isVideo && <div className="demo-timeline">
              <TimeLabel className="demo-time" seconds={currentTime} />
              <Slider label="播放进度" className="demo-range demo-seek" min={0} max={duration > 0 ? duration : 1} step={0.1}
                value={Math.min(currentTime, duration > 0 ? duration : 1)} disabled={unavailable || duration <= 0}
                style={rangeStyle(duration > 0 ? (currentTime / duration) * 100 : 0)} onValueChange={actions.seek}
                valueText={`${formatTime(currentTime)}，总时长 ${formatTime(duration)}`} />
              <TimeLabel className="demo-time demo-time--total" seconds={duration} />
            </div>}
            <div className="demo-controls-row">
              <div className="demo-controls-group">
                {isVideo ? <>
                  <Button className="demo-button" onClick={actions.togglePlayback} disabled={unavailable}>
                    <span className={isPlaying ? 'demo-pause-icon' : 'demo-play-icon'} aria-hidden="true" />
                    {isPlaying ? '暂停' : status === 'ended' ? '重播' : '播放'}
                  </Button>
                  <Button onClick={actions.replay} disabled={unavailable || status === 'loading'} className="demo-button demo-replay">从头播放</Button>
                  <span className={`demo-playback-status demo-playback-status--${status}`}><span aria-hidden="true" />{statusLabels[status]}</span>
                </> : <span className="demo-story-status">{storyKind === 'choice' ? '故事正在等待你的选择' : '每一条路，都值得再走一次'}</span>}
              </div>
              <div className="demo-controls-group demo-controls-group--right">
                <label className="demo-volume"><span>音量</span>
                  <Slider label="音量" className="demo-range" min={0} max={1} step={0.01} value={visibleVolume}
                    style={rangeStyle(visibleVolume * 100)} onValueChange={actions.setVolume} valueText={`${Math.round(visibleVolume * 100)}%`} />
                </label>
                <Button className="demo-button" onClick={actions.toggleFullscreen} aria-label="切换全屏">
                  <span className="demo-fullscreen-icon" aria-hidden="true" /><span className="demo-fullscreen-label">全屏</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <footer className="demo-footer"><span>让故事占据此刻</span>
        <span className="demo-shortcuts">{isVideo && <><kbd>Space</kbd> 播放 / 暂停 <span>·</span></>} <kbd>F</kbd> 全屏</span>
      </footer>
      {slots.modal}
    </main>
  );
}
