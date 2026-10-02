import { StorySession, type SessionContent, type VideoPort } from '../../src/runtime/session';
import type { PlaybackSnapshot } from '../../src/runtime/types';

export class ContentVideo implements VideoPort {
  snapshot: PlaybackSnapshot = {
    sourceId: 0, status: 'idle', currentTime: 0, duration: 0, volume: 1, muted: false, error: null,
  };
  readonly listeners = new Set<() => void>();
  readonly loads: Array<{ url: string; sourceId: number }> = [];
  plays = 0;
  pauses = 0;
  getSnapshot(): PlaybackSnapshot { return this.snapshot; }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  load(url: string, sourceId: number): void {
    this.loads.push({ url, sourceId });
    this.emit({ sourceId, status: 'loading', currentTime: 0, duration: 0, error: null });
    this.emit({ sourceId, status: 'ready', duration: 10 });
  }
  play(): void { this.plays += 1; this.emit({ status: 'playing' }); }
  pause(): void {
    this.pauses += 1;
    if (this.snapshot.status === 'playing') this.emit({ status: 'paused' });
  }
  seek(currentTime: number): void { this.emit({ currentTime }); }
  setVolume(volume: number): void { this.emit({ volume }); }
  dispose(): void { this.listeners.clear(); }
  emit(patch: Partial<PlaybackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) if (this.listeners.has(listener)) listener();
  }
}

export function content(lease = 'original'): SessionContent {
  return {
    story: { schemaVersion: 1, nodes: [
      { id: 'intro', type: 'video', mediaId: 'intro', next: 'choice' },
      { id: 'choice', type: 'choice', prompt: lease, options: [
        { id: 'go', label: '继续', next: 'branch' }, { id: 'stop', label: '停止', next: 'end' },
      ] },
      { id: 'branch', type: 'video', mediaId: 'branch', next: 'end' },
      { id: 'end', type: 'end', title: lease, description: '' },
    ] },
    entryNodeId: 'intro',
    mediaUrls: { intro: `adv-media://${lease}/intro`, branch: `adv-media://${lease}/branch` },
    mediaRevisions: { intro: 'intro-sha256', branch: 'branch-sha256' },
  };
}

export function setupContent(initial = content()) {
  const video = new ContentVideo();
  const session = new StorySession(initial.story, initial.entryNodeId, initial.mediaUrls, video, initial.mediaRevisions);
  return { session, video };
}
