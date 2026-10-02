import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGameContent } from '../src/desktop/content';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = args.indexOf('--game');
const gameId = flag < 0 ? 'demo' : args[flag + 1];
try {
  if (!gameId || !/^[a-zA-Z0-9_-]+$/.test(gameId)) throw new Error('--game 需要有效的作品目录名。');
  const content = await loadGameContent(path.join(root, 'games', gameId));
  if (content.game.id !== gameId) throw new Error('game.json 的 id 必须与作品目录名一致。');
  console.log(`已校验 ${content.game.title}: ${content.story.nodes.length} 个剧情节点 / ${content.videos.size} 个视频。`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
