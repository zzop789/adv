import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { GameInfo, StoryDefinition, WorkBuildInfo } from '../runtime/types';
import { storySchema, validateStory } from '../runtime/story-schema';

const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const gameSchema = z.object({
  schemaVersion: z.literal(2),
  id,
  title: z.string().min(1),
  subtitle: z.string(),
  description: z.string(),
  entryNodeId: id,
  build: z.object({
    executableName: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
      .refine((value) => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)),
    appId: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/),
    icon: z.string().min(1),
  }),
});
const assetsSchema = z.object({
  schemaVersion: z.literal(1),
  videos: z.record(id, z.object({ file: z.string().min(1) })),
});

export interface GameContent {
  game: GameInfo;
  build: WorkBuildInfo;
  story: StoryDefinition;
  root: string;
  videos: ReadonlyMap<string, string>;
}

export function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function resolveContentFile(root: string, relativeFile: string): Promise<string> {
  // Both separators are treated as paths even when authoring/testing on another OS.
  const normalized = relativeFile.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized) || normalized.includes(':')) {
    throw new Error('素材路径必须是作品目录内的相对路径。');
  }
  const absolute = path.resolve(root, normalized);
  if (!isInside(root, absolute)) throw new Error('素材路径不能越出作品目录。');
  const [actualRoot, actualFile] = await Promise.all([realpath(root), realpath(absolute)]);
  if (!isInside(actualRoot, actualFile)) throw new Error('素材链接不能指向作品目录之外。');
  if (!(await stat(actualFile)).isFile()) throw new Error('素材必须是文件。');
  return actualFile;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${path.basename(file)} 无法读取，请检查文件是否存在且为有效 JSON。`, { cause: error });
  }
}

function requireMediaDirectory(file: string): void {
  const normalized = path.posix.normalize(file.replaceAll('\\', '/'));
  if (!normalized.startsWith('media/')) throw new Error('视频和图标必须放在作品的 media/ 目录内，保证构建时完整复制。');
}

export async function loadGameContent(gameDirectory: string): Promise<GameContent> {
  const root = await realpath(gameDirectory);
  const gameResult = gameSchema.safeParse(await readJson(path.join(root, 'game.json')));
  if (!gameResult.success) throw new Error('game.json 配置不正确，请检查作品信息和 schemaVersion。');
  const assetsResult = assetsSchema.safeParse(await readJson(path.join(root, 'assets.json')));
  if (!assetsResult.success) throw new Error('assets.json 配置不正确，请检查素材映射和 schemaVersion。');
  const { schemaVersion: _version, build, ...game } = gameResult.data;
  const storyResult = storySchema.safeParse(await readJson(path.join(root, 'story.json')));
  if (!storyResult.success) throw new Error('story.json 格式不正确，请检查节点字段和 schemaVersion。');
  const videos = new Map<string, string>();
  for (const [mediaId, asset] of Object.entries(assetsResult.data.videos)) {
    requireMediaDirectory(asset.file);
    if (!['.mp4', '.webm'].includes(path.extname(asset.file).toLowerCase())) {
      throw new Error(`素材 ${mediaId} 需要使用 MP4 或 WebM 文件。`);
    }
    try {
      videos.set(mediaId, await resolveContentFile(root, asset.file));
    } catch (error) {
      throw new Error(`素材 ${mediaId} 无法读取，请检查文件是否存在且位于作品目录内。`, { cause: error });
    }
  }
  validateStory(storyResult.data, game.entryNodeId, new Set(videos.keys()));
  if (path.extname(build.icon).toLowerCase() !== '.ico') throw new Error('作品图标必须是 ICO 文件。');
  requireMediaDirectory(build.icon);
  try {
    await resolveContentFile(root, build.icon);
  } catch (error) {
    throw new Error('作品图标无法读取，请检查 build.icon。', { cause: error });
  }
  return { game, build, story: storyResult.data, root, videos };
}
