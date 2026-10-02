import type { PlaybackSnapshot } from '../../runtime/types';

export function finiteVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

export function initialSnapshot(video: HTMLVideoElement): PlaybackSnapshot {
  return { sourceId: 0, status: 'idle', currentTime: 0, duration: 0,
    volume: finiteVolume(video.volume), muted: video.muted, error: null };
}

export function readTiming(video: HTMLVideoElement): Pick<PlaybackSnapshot, 'currentTime' | 'duration'> {
  const duration = Number.isFinite(video.duration) && video.duration >= 0 ? video.duration : 0;
  const currentTime = Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0;
  return { duration, currentTime: duration > 0 ? Math.min(duration, currentTime) : currentTime };
}

export function playbackError(reason: unknown): string {
  const name = typeof reason === 'object' && reason !== null && 'name' in reason ? reason.name : '';
  if (name === 'NotAllowedError') return '播放被阻止，请点击播放按钮重试。';
  if (name === 'NotSupportedError') return '无法播放此视频，请检查文件是否损坏或格式是否受支持。';
  if (name === 'AbortError') return '视频播放已中断，请重试。';
  return '视频播放失败，请重试或更换视频文件。';
}

export function mediaError(code: number): string {
  const messages: Record<number, string> = {
    1: '视频加载已中断，请重新选择文件或重试。',
    2: '无法读取视频，请检查文件是否仍然存在，然后重试。',
    3: '视频解码失败，请更换可播放的视频文件。',
    4: '不支持此视频格式或文件无法访问，请更换文件后重试。',
  };
  return messages[code] ?? '视频加载失败，请重新选择文件。';
}
