import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import type { GameContent } from './content';

export type ByteRange = { start: number; end: number };

export function parseByteRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const second = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (second !== null && !Number.isSafeInteger(second))) return null;
  if (first === null) {
    if (!second || second <= 0) return null;
    return { start: Math.max(0, size - second), end: size - 1 };
  }
  const end = second === null ? size - 1 : Math.min(second, size - 1);
  if (first >= size || first > end) return null;
  return { start: first, end };
}

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
  if (!file) return new Response(null, { status: 404 });

  try {
    const { size } = await stat(file);
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
    const stream = createReadStream(file, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}
