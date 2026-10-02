import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { gameSchema, assetsSchema } from './schemas';
import { readJson } from './paths';

export async function readWorkConfiguration(directory: string) {
  const root = await realpath(directory);
  const game = gameSchema.safeParse(await readJson(path.join(root, 'game.json')));
  if (!game.success) throw new Error('game.json 配置不正确，请检查作品信息和 schemaVersion。');
  const assets = assetsSchema.safeParse(await readJson(path.join(root, 'assets.json')));
  if (!assets.success) throw new Error('assets.json 配置不正确，请检查素材映射和 schemaVersion。');
  return { root, game: game.data, assets: assets.data };
}
