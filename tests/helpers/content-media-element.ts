export class ContentMediaElement extends EventTarget {
  src = '';
  paused = true;
  ended = false;
  readyState = 0;
  currentTime = 0;
  duration = Number.NaN;
  volume = 1;
  muted = false;
  error: { code: number } | null = null;
  loads = 0;
  plays = 0;
  failLoad = false;
  playResult: () => Promise<void> = () => Promise.resolve();
  play(): Promise<void> { this.plays += 1; this.paused = false; return this.playResult(); }
  pause(): void { this.paused = true; }
  load(): void {
    this.loads += 1;
    this.paused = true;
    this.ended = false;
    this.currentTime = 0;
    this.duration = Number.NaN;
    this.readyState = 0;
    this.error = null;
    if (this.failLoad) throw new Error('decode failed');
  }
  removeAttribute(): void { this.src = ''; }
  ready(): void {
    this.readyState = 4;
    this.duration = 10;
    this.dispatchEvent(new Event('canplay'));
  }
  finish(): void {
    this.ended = true;
    this.paused = true;
    this.currentTime = 10;
    this.dispatchEvent(new Event('ended'));
  }
}
