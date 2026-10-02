import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build as buildRenderer } from 'vite';
import { buildDesktop } from './build-desktop.mjs';
import {
  copyWork, createStaging, distRoot, isEntrypoint, parseArguments, publishStaging,
  readWork, removeOutput, root, typecheck, validateWork,
} from './workspace.mjs';

export async function writeAppManifest(work, output) {
  const project = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  await writeFile(path.join(output, 'package.json'), `${JSON.stringify({
    name: `adv-${work.id}`,
    productName: work.config.title,
    version: project.version,
    private: true,
    main: 'dist-electron/main.cjs',
    advGameId: work.id,
    advAppId: work.config.build.appId,
  }, null, 2)}\n`);
}

async function writeBundledLicenses(output) {
  const notices = [];
  for (const name of ['react', 'react-dom', 'scheduler', 'zod']) {
    const directory = path.join(root, 'node_modules', name);
    const dependency = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    const license = await readFile(path.join(directory, 'LICENSE'), 'utf8');
    notices.push(`${name} ${dependency.version}\n${license}`);
  }
  await writeFile(path.join(output, 'THIRD_PARTY_LICENSES.txt'), notices.join('\n\n--------------------\n\n'));
}

export async function buildGame(gameId, { checkTypes = true } = {}) {
  const work = await readWork(gameId);
  if (checkTypes) await typecheck();
  await validateWork(gameId);
  const staging = await createStaging(distRoot, gameId);
  const destination = path.join(distRoot, gameId);
  const previousGame = process.env.ADV_GAME_ID;
  process.env.ADV_GAME_ID = gameId;
  try {
    await buildRenderer({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      build: { outDir: path.join(staging, 'dist'), emptyOutDir: true },
    });
    await buildDesktop(work, staging);
    await copyWork(work, staging);
    await writeAppManifest(work, staging);
    await writeBundledLicenses(staging);
    await publishStaging(distRoot, staging, destination);
    console.log(`已构建 ${work.config.title}：${destination}`);
    return { work, directory: destination };
  } catch (error) {
    await removeOutput(distRoot, staging);
    throw error;
  } finally {
    if (previousGame === undefined) delete process.env.ADV_GAME_ID;
    else process.env.ADV_GAME_ID = previousGame;
  }
}

if (isEntrypoint(import.meta.url)) {
  await buildGame(parseArguments().game);
}
