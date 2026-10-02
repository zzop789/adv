import type { AuthoringDocument } from '../../authoring/contracts';
import type { SaveStoryRequest } from '../../authoring/storage';
import { loadStoryDocument, saveStoryDocument, validateStoryDocument } from '../../authoring/storage';
import { readWorkConfiguration } from '../content/configuration';

/** Bound to the selected local work; no renderer-supplied filesystem paths. */
export class AuthoringService {
  constructor(private readonly directory: string, private readonly gameId: string) {}

  private async configuration() {
    const value = await readWorkConfiguration(this.directory);
    if (value.game.id !== this.gameId) throw new Error('作品 ID 与当前开发目标不一致。');
    return value;
  }

  async read(): Promise<AuthoringDocument> {
    const config = await this.configuration();
    const document = await loadStoryDocument(this.directory);
    return {
      ...document, entryNodeId: config.game.entryNodeId,
      mediaIds: Object.keys(config.assets.videos), title: config.game.title,
    };
  }

  async validate(story: unknown) {
    await this.configuration();
    return { story: await validateStoryDocument(this.directory, story) };
  }

  async save(request: SaveStoryRequest) {
    await this.configuration();
    return saveStoryDocument(this.directory, request);
  }
}
