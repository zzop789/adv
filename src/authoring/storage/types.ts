import type { StoryDefinition } from '../../runtime/types';

export interface StoredStoryDocument {
  story: StoryDefinition;
  /** SHA-256 of the exact on-disk bytes, including BOM and whitespace. */
  revision: string;
}

export interface SaveStoryRequest {
  story: unknown;
  expectedRevision: string;
}
