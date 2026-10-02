declare const __ADV_GAME_ID__: string;
declare const __ADV_GAME_TITLE__: string;
declare const __ADV_APP_ID__: string;
declare const __ADV_GAME_SOURCE__: string | null;

declare module '@work-ui' {
  const WorkUI: import('../ui/contracts').WorkUI;
  export default WorkUI;
}
