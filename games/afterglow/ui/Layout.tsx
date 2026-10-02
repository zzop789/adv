import type { CSSProperties } from 'react';
import type { WorkLayoutProps } from '../../../src/ui/contracts';
import { Button, Slider, TimeLabel, formatTime } from '../../../src/ui-base';
import './styles.css';

function fillStyle(value: number): CSSProperties {
  return { '--afterglow-fill': `${Math.min(100, Math.max(0, value))}%` } as CSSProperties;
}

export default function Layout({ game, playback, storyKind, actions, videoHostRef, slots, openSettings }: WorkLayoutProps) {
  const { status, currentTime, duration, muted, volume } = playback;
  const isVideo = storyKind === 'video';
  const playing = status === 'playing' || status === 'loading';
  const unavailable = status === 'idle' || status === 'error';
  const visibleVolume = muted ? 0 : volume;
  return (
    <main className="afterglow-shell">
      <header className="afterglow-header">
        <div className="afterglow-imprint"><span className="afterglow-stamp" aria-hidden="true">光</span><span>拾光来信<span className="afterglow-imprint-en">LETTERS IN THE LIGHT</span></span></div>
        <div className="afterglow-header-meta"><span>一封写给你的影像书信</span><span className="afterglow-local">离线放映</span><Button className="afterglow-text-button" onClick={openSettings}>设置</Button></div>
      </header>
      <div className="afterglow-title-row">
        <div><p className="afterglow-eyebrow">{game.subtitle || '光会落下，故事会留下'}</p><h1>{game.title}</h1></div>
        <p className="afterglow-description">{game.description}</p>
      </div>
      <div className="afterglow-layout">
        <section className="afterglow-film" aria-label="影像放映">
          <div className="afterglow-film-topline"><span>片刻留影</span><span aria-hidden="true">― 01 ―</span></div>
          <div className="afterglow-screen">
            <div ref={videoHostRef} className="afterglow-video-host" />
            {slots.playback}
            {!isVideo && <div className="afterglow-film-caption"><span>{storyKind === 'choice' ? '下一页，由你来写' : '此刻，成为回忆'}</span></div>}
          </div>
          {isVideo ? <div className="afterglow-film-controls">
            <div className="afterglow-time-row">
              <TimeLabel seconds={currentTime} />
              <Slider label="播放进度" className="afterglow-range afterglow-seek" min={0} max={duration > 0 ? duration : 1} step={0.1}
                value={Math.min(currentTime, duration > 0 ? duration : 1)} disabled={unavailable || duration <= 0}
                style={fillStyle(duration > 0 ? (currentTime / duration) * 100 : 0)} onValueChange={actions.seek}
                valueText={`${formatTime(currentTime)}，总时长 ${formatTime(duration)}`} />
              <TimeLabel seconds={duration} />
            </div>
            <div className="afterglow-film-buttons">
              <Button className="afterglow-text-button" onClick={actions.togglePlayback} disabled={unavailable}>{playing ? '暂停' : status === 'ended' ? '重播' : '播放'}</Button>
              <span aria-hidden="true">/</span>
              <Button className="afterglow-text-button" onClick={actions.replay} disabled={unavailable || status === 'loading'}>从头播放</Button>
              <span className="afterglow-film-status">{status === 'playing' ? '影像正在流动' : status === 'paused' ? '暂停片刻' : status === 'loading' ? '载入中' : status === 'error' ? '等待重试' : '静候放映'}</span>
            </div>
          </div> : <p className="afterglow-film-note">{storyKind === 'choice' ? '镜头停在这里，等待你的回答。' : '影像会结束，余光会留下。'}</p>}
          <div className="afterglow-film-footer"><span className="afterglow-handwriting">把没有说出口的话，留在光里。</span><Button className="afterglow-text-button" onClick={actions.toggleFullscreen} aria-label="切换全屏">全屏放映 ↗</Button></div>
        </section>

        <aside className="afterglow-letter" aria-label="信件与选择">
          <div className="afterglow-letter-meta"><span>致，读信的人</span><span className="afterglow-letter-seal" aria-hidden="true">来<br />信</span></div>
          {isVideo && <div className="afterglow-letter-body">
            <p className="afterglow-letter-kicker">一页未寄出的心事</p><h2>如果你还记得<br />那个黄昏</h2>
            <p>日子走得很慢，窗外的光却总在不经意间变了颜色。</p><p>有些话，被收进一封信里。等影像停下，再听听你的心意。</p>
            <div className="afterglow-letter-rule" /><p className="afterglow-letter-footnote">先看完这一段，再决定故事的下一页。</p>
          </div>}
          {slots.story}
          <span className="afterglow-letter-signature">余光，敬上</span>
        </aside>
      </div>
      <footer className="afterglow-footer">
        <span>一段影像 · 一次选择 · 一封回信</span>
        <div className="afterglow-footer-tools">
          <label className="afterglow-volume"><span>音量</span>
            <Slider label="音量" className="afterglow-range" min={0} max={1} step={0.01} value={visibleVolume}
              style={fillStyle(visibleVolume * 100)} onValueChange={actions.setVolume} valueText={`${Math.round(visibleVolume * 100)}%`} />
          </label>
          <span className="afterglow-key-hint">{isVideo ? 'SPACE 播放 / 暂停 · ' : ''}F 全屏</span>
        </div>
      </footer>
      {slots.modal}
    </main>
  );
}
