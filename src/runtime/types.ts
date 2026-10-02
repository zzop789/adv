export interface GameInfo {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  entryNodeId: string;
}

export interface WorkBuildInfo {
  executableName: string;
  appId: string;
  icon: string;
}

export interface VideoNode {
  id: string;
  type: 'video';
  mediaId: string;
  next: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  next: string;
}

export interface ChoiceNode {
  id: string;
  type: 'choice';
  prompt: string;
  options: ChoiceOption[];
}

export interface EndNode {
  id: string;
  type: 'end';
  title: string;
  description: string;
}

export type StoryNode = VideoNode | ChoiceNode | EndNode;

export interface StoryDefinition {
  schemaVersion: 1;
  nodes: StoryNode[];
}

export interface StorySnapshot {
  node: StoryNode;
  visitId: number;
  runId: number;
}

export interface StoryActions {
  choose(optionId: string, visitId: number): void;
  restart(): void;
}

export interface LoadedGame {
  game: GameInfo;
  story: StoryDefinition;
  videoUrls: Record<string, string>;
}

export type GameLoadResult =
  | { ok: true; value: LoadedGame }
  | { ok: false; error: string };

export interface PlaybackSnapshot {
  sourceId: number;
  status: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  error: string | null;
}

export interface PlaybackActions {
  play(): void;
  pause(): void;
  replay(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  toggleFullscreen(): void;
  retry(): void;
}

export interface DesktopApi {
  loadGame(): Promise<GameLoadResult>;
  setFullscreen(value: boolean): Promise<boolean>;
  getFullscreen(): Promise<boolean>;
}

export interface SessionSnapshot {
  story: StorySnapshot;
  playback: PlaybackSnapshot;
}

declare global {
  interface Window {
    adv: DesktopApi;
  }
}
