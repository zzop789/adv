import type { PlaybackScreenProps } from '../../../../src/ui/contracts';
import { Button } from '../../../../src/ui-base';
import '../styles.css';

/** Can be rendered directly; the caller provides the playback state and intent handlers. */
export default function PlaybackScreen({ title, status, error, onPlay, onRetry }: PlaybackScreenProps) {
  if (status === 'playing') return null;
  return (
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
            <p className="demo-error-message" role="alert">{error || '请确认影片文件完整，然后重试。'}</p>
            <Button appearance="primary" className="demo-button demo-button--primary" onClick={onRetry}>重新载入</Button>
          </>
        ) : (
          <>
            <span className="demo-overlay-kicker">{status === 'paused' ? '故事稍作停留' : status === 'ended' ? '本段播放结束' : '序幕 · 即将开始'}</span>
            <h2>{status === 'ready' ? title : status === 'paused' ? '准备好继续了吗' : '感谢观看'}</h2>
            <Button appearance="primary" className="demo-button demo-button--primary" onClick={onPlay}>
              <span className="demo-play-icon" aria-hidden="true" />
              {status === 'paused' ? '继续播放' : status === 'ended' ? '重新观看' : '开始播放'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
