import { spawn } from 'node:child_process';
import { access, cp, lstat, mkdir, readdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
export const distRoot = path.join(root, 'dist');
export const releaseRoot = path.join(root, 'release');

export function parseArguments(argv = process.argv.slice(2), allowedFlags = []) {
  let game = 'demo';
  let selected = false;
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--game' || argument.startsWith('--game=')) {
      if (selected) throw new Error('--game 只能指定一次。');
      game = argument === '--game' ? argv[++index] : argument.slice(7);
      selected = true;
    } else if (allowedFlags.includes(argument)) {
      flags.add(argument);
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  if (typeof game !== 'string' || !/^[a-z][a-z0-9-]*$/.test(game)) {
    throw new Error('作品 ID 只能包含小写字母、数字和连字符，并以字母开头。');
  }
  if (flags.has('--all') && selected) throw new Error('--all 与 --game 不能同时使用。');
  return { game, flags };
}

export async function readWork(gameId) {
  if (typeof gameId !== 'string' || !/^[a-z][a-z0-9-]*$/.test(gameId)) {
    throw new Error('无效的作品 ID。');
  }
  const directory = path.join(root, 'games', gameId);
  const actual = await realpath(directory);
  if (path.dirname(actual) !== await realpath(path.join(root, 'games'))) {
    throw new Error('作品目录必须位于本工程的 games 目录中。');
  }
  const game = JSON.parse((await readFile(path.join(directory, 'game.json'), 'utf8')).replace(/^\uFEFF/, ''));
  if (game.id !== gameId) throw new Error(`作品目录 ${gameId} 与 game.json 的 ID 不一致。`);
  if (typeof game.title !== 'string' || !game.title.trim()) throw new Error('缺少作品名称。');
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(game.build?.executableName ?? '')) {
    throw new Error('build.executableName 必须是安全的英文可执行文件名称。');
  }
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(game.build.executableName)) {
    throw new Error('build.executableName 不能是 Windows 保留名称。');
  }
  if (typeof game.build?.appId !== 'string' || !/^[a-z][a-z0-9.-]+$/.test(game.build.appId)) {
    throw new Error('缺少有效的 build.appId。');
  }
  return { id: gameId, directory, config: game };
}

export async function readRegisteredWorks() {
  const entries = await readdir(path.join(root, 'games'), { withFileTypes: true });
  const works = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      await access(path.join(root, 'games', entry.name, 'game.json'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    works.push(await readWork(entry.name));
  }
  return works;
}

export function assertUniqueWorkIdentities(registered, selectedIds) {
  const selected = new Set(selectedIds);
  for (const key of ['executableName', 'appId']) {
    for (const work of registered.filter((entry) => selected.has(entry.id))) {
      const value = work.config.build[key].toLowerCase();
      const conflicting = registered.find((entry) => entry.id !== work.id && entry.config.build[key].toLowerCase() === value);
      if (conflicting) throw new Error(`作品 ${work.id} 与 ${conflicting.id} 的 build.${key} 重复，必须使用独立身份。`);
    }
  }
}

export function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`命令执行失败（${signal ?? code}）：node ${args.join(' ')}`));
    });
  });
}

export async function validateWork(gameId) {
  await runNode(['--import', 'tsx', 'tools/validate-content.ts', '--game', gameId]);
}

export async function typecheck() {
  await runNode(['node_modules/typescript/bin/tsc', '--noEmit']);
}

export async function assertOutputChild(base, target) {
  if (![distRoot, releaseRoot].includes(base)) throw new Error('不允许操作此输出根目录。');
  const resolved = path.resolve(target);
  if (path.dirname(resolved) !== base || resolved === base) {
    throw new Error(`输出操作超出指定目录：${target}`);
  }
  await mkdir(base, { recursive: true });
  if (await realpath(base) !== base) throw new Error(`输出根目录不允许使用符号链接：${base}`);
  const info = await lstat(resolved).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (info?.isSymbolicLink()) throw new Error(`输出目标不允许使用符号链接：${target}`);
  return resolved;
}

export async function removeOutput(base, target) {
  await rm(await assertOutputChild(base, target), { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
}

async function renameOutput(source, destination) {
  // Windows scanners can briefly hold a newly written executable or media file.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5) throw error;
      await delay(120 * (attempt + 1));
    }
  }
}

export async function createStaging(base, name) {
  const staging = path.join(base, `.staging-${name}-${randomUUID()}`);
  await assertOutputChild(base, staging);
  await mkdir(staging);
  return staging;
}

// Keep the previous successful output until the new output is entirely ready.
export async function publishStaging(base, staging, destination) {
  await assertOutputChild(base, staging);
  await assertOutputChild(base, destination);
  const backup = path.join(base, `.previous-${path.basename(destination)}-${randomUUID()}`);
  await assertOutputChild(base, backup);
  let hadPrevious = false;
  try {
    await renameOutput(destination, backup);
    hadPrevious = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await renameOutput(staging, destination);
  } catch (error) {
    if (hadPrevious) await renameOutput(backup, destination);
    throw error;
  }
  if (hadPrevious) await removeOutput(base, backup);
}

export async function copyWork(work, output) {
  const destination = path.join(output, 'games', work.id);
  await mkdir(destination, { recursive: true });
  for (const name of ['game.json', 'story.json', 'assets.json', 'media']) {
    await cp(path.join(work.directory, name), path.join(destination, name), {
      recursive: true,
      filter: async (source) => {
        if ((await lstat(source)).isSymbolicLink()) throw new Error(`素材不允许使用符号链接：${source}`);
        return true;
      },
    });
  }
}

export function isEntrypoint(moduleUrl) {
  return Boolean(process.argv[1]) && fileURLToPath(moduleUrl) === path.resolve(process.argv[1]);
}
