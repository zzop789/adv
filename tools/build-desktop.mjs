import path from 'node:path';
import { build } from 'esbuild';
import { root } from './workspace.mjs';

export async function buildDesktop(work, output, { development = false } = {}) {
  await build({
    absWorkingDir: root,
    entryPoints: { main: 'src/desktop/main.ts', preload: 'src/desktop/preload.ts' },
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outdir: path.join(output, 'dist-electron'),
    outExtension: { '.js': '.cjs' },
    external: ['electron'],
    define: {
      __ADV_GAME_ID__: JSON.stringify(work.id),
      __ADV_GAME_TITLE__: JSON.stringify(work.config.title),
      __ADV_APP_ID__: JSON.stringify(work.config.build.appId),
      __ADV_GAME_SOURCE__: development ? JSON.stringify(work.directory) : 'null',
    },
  });
}
