import type { GameLoadResult, StoryDefinition } from '../runtime/types';

export type AuthoringResult<T> = { ok: true; value: T } | { ok: false; error: string };
export interface AuthoringDocument {
  story: StoryDefinition;
  revision: string;
  entryNodeId: string;
  mediaIds: string[];
  title: string;
}
export type AuthoringReadResult = AuthoringResult<AuthoringDocument>;
export type AuthoringValidationResult = AuthoringResult<{ story: StoryDefinition }>;
export type AuthoringSaveResult = AuthoringResult<{ revision: string }>;

/** Available only in the local development build, never in a distributed game. */
export interface AuthoringApi {
  read(): Promise<AuthoringReadResult>;
  validate(story: unknown): Promise<AuthoringValidationResult>;
  save(request: { story: unknown; expectedRevision: string }): Promise<AuthoringSaveResult>;
  preview(story: unknown): Promise<GameLoadResult>;
}
