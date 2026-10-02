import { spawn } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'vite';
import electron from 'electron';
import { buildDesktop } from './build-desktop.mjs';
import { writeAppManifest } from './build.mjs';
import { createStaging, distRoot, parseArguments, readWork, removeOutput, root, validateWork } from './workspace.mjs';

const { game } = parseArguments();
const work = await readWork(game);
await validateWork(game);
const directory = await createStaging(distRoot, `dev-${game}`);
process.env.ADV_GAME_ID = game;
let server;
let child;
let stopped = false;
async function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  child?.kill();
  await server?.close();
  await removeOutput(distRoot, directory);
  process.exitCode = code;
}

try {
  await buildDesktop(work, directory, { development: true });
  await writeAppManifest(work, directory);
  server = await createServer({ root, configFile: path.join(root, 'vite.config.ts') });
  await server.listen();
  server.printUrls();
  const env = { ...process.env, ADV_DEV_SERVER_URL: 'http://127.0.0.1:5173' };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, [directory], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  child.once('exit', (code) => void stop(code ?? 0));
  child.once('error', (error) => { console.error(error); void stop(1); });
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
} catch (error) {
  await stop(1);
  throw error;
}
