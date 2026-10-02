import type { PlaybackScreenProps } from '../../../../src/ui/contracts';
import { Button } from '../../../../src/ui-base';
import '../styles.css';

export default function PlaybackScreen({ status, error, onPlay, onRetry }: PlaybackScreenProps) {
  if (status === 'playing') return null;
  return (
    <div className={`afterglow-screen-overlay afterglow-screen-overlay--${status}`}>
      {status === 'error' ? (
        <div className="afterglow-screen-content">
          <p className="afterglow-screen-eyebrow">放映暂时中断</p><h2>这段影像还未抵达</h2>
          <p role="alert" className="afterglow-media-error">{error || '请确认影片完整，然后重试。'}</p>
          <Button className="afterglow-button afterglow-button--light" onClick={onRetry}>重新载入</Button>
        </div>
      ) : status === 'idle' || status === 'loading' ? (
        <div className="afterglow-screen-content"><span className="afterglow-loading-line" aria-hidden="true" /><p role="status">正在准备放映</p></div>
      ) : (
        <div className="afterglow-screen-content">
          <p className="afterglow-screen-eyebrow">{status === 'paused' ? '把这一刻，稍作停留' : '请收下这一段时光'}</p>
          <Button className="afterglow-button afterglow-button--light" onClick={onPlay}>
            <span aria-hidden="true">▷</span>{status === 'paused' ? '继续播放' : status === 'ended' ? '重新观看' : '开始播放'}
          </Button>
        </div>
      )}
    </div>
  );
}
