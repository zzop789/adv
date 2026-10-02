import type { StoryDefinition } from '../model/story';

export interface SessionContent {
  story: StoryDefinition;
  entryNodeId: string;
  mediaUrls: Readonly<Record<string, string>>;
  mediaRevisions?: Readonly<Record<string, string>>;
}

export interface ContentUpdateOptions {
  strategy: 'restart' | 'replay-node' | 'preserve';
  nodeId?: string;
}

export type ContentUpdateResult = { ok: true } | { ok: false; error: string };
