import { build } from 'esbuild';

await build({
  entryPoints: { main: 'src/desktop/main.ts', preload: 'src/desktop/preload.ts' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
});
