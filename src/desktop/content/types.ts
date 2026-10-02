import type { GameInfo, StoryDefinition, WorkBuildInfo } from '../../runtime/types';

export interface GameContent {
  game: GameInfo;
  build: WorkBuildInfo;
  story: StoryDefinition;
  root: string;
  videos: ReadonlyMap<string, string>;
  mediaRevisions?: Record<string, string>;
}
