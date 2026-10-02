import { protocol, net } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveContentFile } from '../content/paths';
import type { DesktopContext } from '../app/context';

export function declareProtocols(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'adv-app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: 'adv-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

export function registerProtocols(context: DesktopContext): void {
  protocol.handle('adv-media', (request) => context.contents.serve(request));
  protocol.handle('adv-app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'app') return new Response(null, { status: 404 });
      const relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      const file = await resolveContentFile(path.join(context.config.projectRoot, 'dist'), relative);
      return net.fetch(pathToFileURL(file).toString());
    } catch { return new Response(null, { status: 404 }); }
  });
}
