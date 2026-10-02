import { loadGameContent } from '../../desktop/content';
import { storySchema } from '../../runtime/story-schema';
import type { StoryDefinition } from '../../runtime/types';
import type { StoredStoryDocument } from './types';
import { resolveWork, readStoryBytes, revisionOf } from './files';

export function parseStory(value: unknown): StoryDefinition {
  const parsed = storySchema.safeParse(value);
  if (!parsed.success) throw new Error('story.json 格式不正确，请检查节点字段和 schemaVersion。');
  return parsed.data;
}

/** Reads an editable document's shape; full game validation is a separate operation. */
export async function loadStoryDocument(gameDirectory: string): Promise<StoredStoryDocument> {
  const root = await resolveWork(gameDirectory);
  const { bytes } = await readStoryBytes(root);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error('story.json 无法解析，请检查 JSON 格式。', { cause: error });
  }
  return { story: parseStory(value), revision: revisionOf(bytes) };
}

/** Validates only the candidate against the current game, assets and local media. */
export async function validateStoryDocument(gameDirectory: string, story: unknown): Promise<StoryDefinition> {
  const candidate = parseStory(story);
  return (await loadGameContent(gameDirectory, { story: candidate })).story;
}
