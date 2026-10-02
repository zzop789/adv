declare const __ADV_GAME_ID__: string;
declare const __ADV_GAME_TITLE__: string;
declare const __ADV_APP_ID__: string;
declare const __ADV_GAME_SOURCE__: string | null;

declare module '@work-ui' {
  import type { ComponentType, RefObject } from 'react';
  const WorkUI: ComponentType<{
    game: import('./types').GameInfo;
    playback: import('./types').PlaybackSnapshot;
    actions: import('./types').PlaybackActions;
    story: import('./types').StorySnapshot;
    storyActions: import('./types').StoryActions;
    videoHostRef: RefObject<HTMLDivElement | null>;
  }>;
  export default WorkUI;
}
