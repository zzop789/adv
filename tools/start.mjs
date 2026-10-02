import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import electron from 'electron';
import { buildGame } from './build.mjs';
import { distRoot, parseArguments, root } from './workspace.mjs';

const { game, flags } = parseArguments(process.argv.slice(2), ['--built']);
if (!flags.has('--built')) await buildGame(game);
const directory = path.join(distRoot, game);
try {
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  if (manifest.advGameId !== game) throw new Error('作品 ID 与构建产物不一致。');
  await access(path.join(directory, 'dist-electron/main.cjs'));
} catch (error) {
  throw new Error(`没有有效的 ${game} 构建产物，请先运行 npm run build -- --game ${game}。`, { cause: error });
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ADV_DEV_SERVER_URL;
const child = spawn(electron, [directory], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.once('error', (error) => { console.error(error); process.exitCode = 1; });
child.once('exit', (code) => { process.exitCode = code ?? 0; });
process.once('SIGINT', () => child.kill());
process.once('SIGTERM', () => child.kill());
