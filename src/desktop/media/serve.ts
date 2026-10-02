import type { FileHandle } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import type { GameContent } from '../content/types';
import { parseByteRange } from './ranges';
import { openMediaFile } from './open-file';

export async function serveLocalMedia(request: Request, content: GameContent | null): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  if (url.protocol !== 'adv-media:' || url.hostname !== 'asset' || url.search || url.hash) {
    return new Response(null, { status: 404 });
  }
  const mediaId = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_-]+$/.test(mediaId)) return new Response(null, { status: 404 });
  const file = content?.videos.get(mediaId);
  if (!file || !content) return new Response(null, { status: 404 });

  let handle: FileHandle | undefined;
  try {
    const opened = await openMediaFile(content.root, file);
    handle = opened.handle;
    const { size } = opened;
    const headers = new Headers({
      'Content-Type': path.extname(file).toLowerCase() === '.webm' ? 'video/webm' : 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });
    const rangeHeader = request.headers.get('range');
    const range = rangeHeader ? parseByteRange(rangeHeader, size) : null;
    if (rangeHeader && !range) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    headers.set('Content-Length', String(size === 0 ? 0 : end - start + 1));
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    if (request.method === 'HEAD' || size === 0) return new Response(null, { status: range ? 206 : 200, headers });
    const stream = handle.createReadStream({ start, end, autoClose: true });
    const response = new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
    handle = undefined; // The response stream owns and closes the checked descriptor.
    return response;
  } catch {
    return new Response(null, { status: 404 });
  } finally {
    await handle?.close();
  }
}
