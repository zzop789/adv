import type { StoryDefinition } from './story';

export interface GameInfo {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  entryNodeId: string;
}

export interface WorkBuildInfo { executableName: string; appId: string; icon: string }

export interface LoadedGame {
  /** A content lease, not a saved-game or authoring document revision. */
  loadId: string;
  previewEnabled: boolean;
  game: GameInfo;
  story: StoryDefinition;
  videoUrls: Record<string, string>;
  mediaRevisions?: Record<string, string>;
}

export type GameLoadResult = { ok: true; value: LoadedGame } | { ok: false; error: string };

export interface DesktopApi {
  authoring?: import('../../authoring/contracts').AuthoringApi;
  loadGame(): Promise<GameLoadResult>;
  releaseGame(loadId: string): Promise<void>;
  setFullscreen(value: boolean): Promise<boolean>;
  getFullscreen(): Promise<boolean>;
}

declare global { interface Window { adv: DesktopApi } }
