import path from 'node:path';
import { storySchema, validateStory } from '../../runtime/story-schema';
import { readWorkConfiguration } from './configuration';
import { readJson } from './paths';
import { resolveVideos, validateIcon } from './assets';
import { mediaFingerprints } from './fingerprints';
import type { GameContent } from './types';

export interface ContentLoadOptions { story?: unknown; fingerprints?: boolean }

export async function loadGameContent(directory: string, options?: ContentLoadOptions): Promise<GameContent> {
  const config = await readWorkConfiguration(directory);
  const { schemaVersion: _version, build, ...game } = config.game;
  const candidate = options && 'story' in options ? options.story : await readJson(path.join(config.root, 'story.json'));
  const parsed = storySchema.safeParse(candidate);
  if (!parsed.success) throw new Error('story.json 格式不正确，请检查节点字段和 schemaVersion。');
  const videos = await resolveVideos(config.root, config.assets.videos);
  validateStory(parsed.data, game.entryNodeId, new Set(videos.keys()));
  await validateIcon(config.root, build.icon);
  return {
    game, build, story: parsed.data, root: config.root, videos,
    mediaRevisions: options?.fingerprints ? await mediaFingerprints(videos) : undefined,
  };
}
