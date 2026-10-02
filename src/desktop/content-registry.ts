import { randomUUID } from 'node:crypto';
import type { LoadedGame } from '../runtime/types';
import type { GameContent } from './content';
import { serveLocalMedia } from './local-media';

/** A loaded player keeps its own media mapping until its content lease is released. */
export class ContentRegistry {
  private readonly contents = new Map<string, GameContent>();

  register(content: GameContent, previewEnabled: boolean): LoadedGame {
    const loadId = randomUUID();
    const snapshot = { ...content, videos: new Map(content.videos) };
    this.contents.set(loadId, snapshot);
    return {
      loadId,
      previewEnabled,
      game: content.game,
      story: content.story,
      videoUrls: Object.fromEntries([...snapshot.videos.keys()].map((id) => [id, `adv-media://asset/${loadId}/${id}`])),
    };
  }

  release(loadId: string): void {
    this.contents.delete(loadId);
  }

  clear(): void {
    this.contents.clear();
  }

  async serve(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.protocol !== 'adv-media:' || url.hostname !== 'asset' || url.search || url.hash) {
      return new Response(null, { status: 404 });
    }
    const match = /^\/([a-f0-9-]{36})\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
    const content = match && this.contents.get(match[1]);
    if (!content || !match) return new Response(null, { status: 404 });
    return serveLocalMedia(new Request(`adv-media://asset/${match[2]}`, {
      method: request.method,
      headers: request.headers,
    }), content);
  }
}
