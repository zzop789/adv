import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const game = process.env.ADV_GAME_ID ?? 'demo';
if (!/^[a-z][a-z0-9-]*$/.test(game)) throw new Error('无效的作品 ID。');

export default defineConfig({
  base: './',
  resolve: { alias: { '@work-ui': path.join(root, 'games', game, 'ui', 'index.tsx') } },
  plugins: [react(), {
    name: 'development-only-refresh-csp',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';"),
  }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: path.join(root, 'dist', game, 'dist') },
});
