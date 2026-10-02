import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveStoryDocument, validateStoryDocument } from '../src/authoring/work-store';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'node --import tsx tools/story.mts --game demo --input <候选JSON> [--write --expected-revision <SHA256>]\n默认只校验并输出当前 revision；--write 仅保存 story.json，不修改 game.json 或素材。';

function parseArguments(args: string[]) {
  let game = 'demo';
  let input: string | undefined;
  let expectedRevision: string | undefined;
  let write = false;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') return null;
    const equals = argument.indexOf('=');
    const flag = equals < 0 ? argument : argument.slice(0, equals);
    if (!['--game', '--input', '--write', '--expected-revision'].includes(flag)) throw new Error(`未知参数：${argument}`);
    if (seen.has(flag)) throw new Error(`${flag} 只能指定一次。`);
    seen.add(flag);
    if (flag === '--write') {
      if (equals >= 0) throw new Error('--write 不接受参数。');
      write = true;
      continue;
    }
    const value = equals >= 0 ? argument.slice(equals + 1) : args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} 需要指定值。`);
    if (flag === '--game') game = value;
    else if (flag === '--input') input = value;
    else expectedRevision = value;
  }
  if (!/^[a-z][a-z0-9-]*$/.test(game)) throw new Error('--game 需要有效的作品目录名。');
  if (!input) throw new Error(`缺少 --input。\n${usage}`);
  if (write && !expectedRevision) throw new Error('--write 必须提供 dry-run 或载入时取得的 --expected-revision，防止覆盖外部修改。');
  if (expectedRevision && !/^[a-fA-F0-9]{64}$/.test(expectedRevision)) throw new Error('--expected-revision 必须是 SHA-256 十六进制值。');
  return { game, input, write, expectedRevision: expectedRevision?.toLowerCase() };
}

/** The optional root lets command tests use isolated workspaces, never real projects. */
export async function runStoryCommand(args: string[], workspaceRoot = root): Promise<string> {
  const options = parseArguments(args);
  if (!options) {
    return usage;
  } else {
    const games = await realpath(path.join(workspaceRoot, 'games'));
    const gameDirectory = await realpath(path.join(games, options.game));
    if (path.dirname(gameDirectory) !== games) throw new Error('作品必须位于本项目 games 目录内。');
    // Do not parse the existing document: a valid candidate may repair broken JSON.
    const target = path.join(gameDirectory, 'story.json');
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile() || await realpath(target) !== target) {
      throw new Error('story.json 必须是作品目录内的普通文件，不能使用符号链接。');
    }
    const currentRevision = createHash('sha256').update(await readFile(target)).digest('hex');
    if (options.expectedRevision && options.expectedRevision !== currentRevision) throw new Error('revision 冲突：剧情已更改，请重新载入并检查候选内容。');
    const input = JSON.parse((await readFile(path.resolve(options.input), 'utf8')).replace(/^\uFEFF/, '')) as unknown;
    const story = await validateStoryDocument(gameDirectory, input);
    if (options.write) {
      const result = await saveStoryDocument(gameDirectory, { story, expectedRevision: options.expectedRevision! });
      return `已保存 ${options.game}/story.json（${story.nodes.length} 个节点），revision: ${result.revision}`;
    } else {
      return `校验通过：${options.game}，${story.nodes.length} 个节点。当前 revision: ${currentRevision}\n未写入文件；保存时添加 --write --expected-revision ${currentRevision}。`;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(await runStoryCommand(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
