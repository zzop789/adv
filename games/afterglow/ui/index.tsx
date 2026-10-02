import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { GameInfo, PlaybackActions, PlaybackSnapshot, StoryActions, StorySnapshot } from '../../../src/runtime/types';
import './styles.css';

interface AfterglowUIProps {
  game: GameInfo;
  playback: PlaybackSnapshot;
  actions: PlaybackActions;
  videoHostRef: RefObject<HTMLDivElement | null>;
  story: StorySnapshot;
  storyActions: StoryActions;
}

function timeLabel(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}

function fillStyle(value: number): CSSProperties {
  return { '--afterglow-fill': `${Math.min(100, Math.max(0, value))}%` } as CSSProperties;
}

export default function AfterglowUI({ game, playback, actions, videoHostRef, story, storyActions }: AfterglowUIProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { node } = story;
  const { status, currentTime, duration, muted, volume } = playback;
  const isVideo = node.type === 'video';
  const playing = status === 'playing' || status === 'loading';
  const unavailable = status === 'idle' || status === 'error';
  const togglePlayback = () => {
    if (!isVideo) return;
    if (playing) actions.pause();
    else if (status === 'ended') actions.replay();
    else actions.play();
  };
  useEffect(() => {
    if (node.type !== 'video') headingRef.current?.focus();
  }, [story.visitId, node.type]);

  return (
    <main className="afterglow-shell">
      <header className="afterglow-header">
        <div className="afterglow-imprint"><span className="afterglow-stamp" aria-hidden="true">光</span><span>拾光来信<span className="afterglow-imprint-en">LETTERS IN THE LIGHT</span></span></div>
        <div className="afterglow-header-meta"><span>一封写给你的影像书信</span><span className="afterglow-local">离线放映</span></div>
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
            {isVideo && status !== 'playing' && (
              <div className={`afterglow-screen-overlay afterglow-screen-overlay--${status}`}>
                {status === 'error' ? (
                  <div className="afterglow-screen-content">
                    <p className="afterglow-screen-eyebrow">放映暂时中断</p><h2>这段影像还未抵达</h2>
                    <p role="alert" className="afterglow-media-error">{playback.error || '请确认影片完整，然后重试。'}</p>
                    <button type="button" className="afterglow-button afterglow-button--light" onClick={actions.retry}>重新载入</button>
                  </div>
                ) : status === 'idle' || status === 'loading' ? (
                  <div className="afterglow-screen-content"><span className="afterglow-loading-line" aria-hidden="true" /><p role="status">正在准备放映</p></div>
                ) : (
                  <div className="afterglow-screen-content">
                    <p className="afterglow-screen-eyebrow">{status === 'paused' ? '把这一刻，稍作停留' : '请收下这一段时光'}</p>
                    <button type="button" className="afterglow-button afterglow-button--light" onClick={togglePlayback}><span aria-hidden="true">▷</span>{status === 'paused' ? '继续播放' : status === 'ended' ? '重新观看' : '开始播放'}</button>
                  </div>
                )}
              </div>
            )}
            {!isVideo && <div className="afterglow-film-caption"><span>{node.type === 'choice' ? '下一页，由你来写' : '此刻，成为回忆'}</span></div>}
          </div>

          {isVideo ? (
            <div className="afterglow-film-controls">
              <div className="afterglow-time-row"><span>{timeLabel(currentTime)}</span><input type="range" className="afterglow-range afterglow-seek" min="0" max={duration > 0 ? duration : 1} step="0.1" value={Math.min(currentTime, duration > 0 ? duration : 1)} disabled={unavailable || duration <= 0} style={fillStyle(duration > 0 ? (currentTime / duration) * 100 : 0)} onChange={(event) => actions.seek(Number(event.currentTarget.value))} aria-label="播放进度" aria-valuetext={`${timeLabel(currentTime)}，总时长 ${timeLabel(duration)}`} /><span>{timeLabel(duration)}</span></div>
              <div className="afterglow-film-buttons"><button type="button" className="afterglow-text-button" onClick={togglePlayback} disabled={unavailable}>{playing ? '暂停' : status === 'ended' ? '重播' : '播放'}</button><span aria-hidden="true">/</span><button type="button" className="afterglow-text-button" onClick={actions.replay} disabled={unavailable || status === 'loading'}>从头播放</button><span className="afterglow-film-status">{status === 'playing' ? '影像正在流动' : status === 'paused' ? '暂停片刻' : status === 'loading' ? '载入中' : status === 'error' ? '等待重试' : '静候放映'}</span></div>
            </div>
          ) : <p className="afterglow-film-note">{node.type === 'choice' ? '镜头停在这里，等待你的回答。' : '影像会结束，余光会留下。'}</p>}

          <div className="afterglow-film-footer"><span className="afterglow-handwriting">把没有说出口的话，留在光里。</span><button type="button" className="afterglow-text-button" onClick={actions.toggleFullscreen} aria-label="切换全屏">全屏放映 ↗</button></div>
        </section>

        <aside className="afterglow-letter" aria-label="信件与选择">
          <div className="afterglow-letter-meta"><span>致，读信的人</span><span className="afterglow-letter-seal" aria-hidden="true">来<br />信</span></div>

          {node.type === 'video' && <div className="afterglow-letter-body"><p className="afterglow-letter-kicker">一页未寄出的心事</p><h2>如果你还记得<br />那个黄昏</h2><p>日子走得很慢，窗外的光却总在不经意间变了颜色。</p><p>有些话，被收进一封信里。等影像停下，再听听你的心意。</p><div className="afterglow-letter-rule" /><p className="afterglow-letter-footnote">先看完这一段，再决定故事的下一页。</p></div>}

          {node.type === 'choice' && <div className="afterglow-letter-body"><p className="afterglow-letter-kicker">现在，轮到你落笔</p><h2 ref={headingRef} tabIndex={-1} id="afterglow-choice-heading">{node.prompt}</h2><div className="afterglow-choices" role="group" aria-labelledby="afterglow-choice-heading">{node.options.map((option, index) => <button type="button" className="afterglow-choice" key={option.id} aria-label={option.label} onClick={() => storyActions.choose(option.id, story.visitId)}><span className="afterglow-choice-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="afterglow-choice-content"><strong>{option.label}</strong>{option.description && <span>{option.description}</span>}</span><span className="afterglow-choice-arrow" aria-hidden="true">→</span></button>)}</div><p className="afterglow-letter-footnote">不必急着回答，故事愿意等你。</p></div>}

          {node.type === 'end' && <div className="afterglow-letter-body afterglow-letter-ending"><p className="afterglow-letter-kicker">信的最后一行</p><h2 ref={headingRef} tabIndex={-1}>{node.title}</h2><p>{node.description}</p><div className="afterglow-letter-rule" /><span className="afterglow-end-mark">愿每一句未尽之言，都有回响。</span><button type="button" className="afterglow-button" onClick={storyActions.restart}>重新开始</button></div>}

          <span className="afterglow-letter-signature">余光，敬上</span>
        </aside>
      </div>

      <footer className="afterglow-footer"><span>一段影像 · 一次选择 · 一封回信</span><div className="afterglow-footer-tools"><label className="afterglow-volume"><span>音量</span><input type="range" className="afterglow-range" min="0" max="1" step="0.01" value={muted ? 0 : volume} style={fillStyle((muted ? 0 : volume) * 100)} onChange={(event) => actions.setVolume(Number(event.currentTarget.value))} aria-label="音量" aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`} /></label><span className="afterglow-key-hint">{isVideo ? 'SPACE 播放 / 暂停 · ' : ''}F 全屏</span></div></footer>
    </main>
  );
}
