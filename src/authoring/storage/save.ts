import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SaveStoryRequest } from './types';
import { resolveWork, readStoryBytes, revisionOf } from './files';
import { parseStory, validateStoryDocument } from './document';
import { configurationBytes, cleanTemporary } from './staging';

const saves = new Map<string, Promise<void>>();

async function saveWithinLock(root: string, request: SaveStoryRequest): Promise<{ revision: string }> {
  const target = path.join(root, 'story.json');
  const current = await readStoryBytes(root);
  if (revisionOf(current.bytes) !== request.expectedRevision) throw new Error('剧情已被其他操作修改，revision 冲突；请重新载入后再保存。');
  const configuration = await configurationBytes(root);
  const candidate = await validateStoryDocument(root, request.story);
  const bytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  const revision = revisionOf(bytes);
  const temporary = path.join(root, `.story-${process.pid}-${randomUUID()}.tmp`);
  let created = false;
  let committed = false;
  try {
    const file = await fs.open(temporary, 'wx', current.mode);
    created = true;
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    const latest = await readStoryBytes(root);
    if (revisionOf(latest.bytes) !== request.expectedRevision) throw new Error('剧情在保存期间被修改，revision 冲突；本次保存已取消。');
    const latestConfiguration = await configurationBytes(root);
    if (configuration.some((original, index) => !original.equals(latestConfiguration[index]))) {
      throw new Error('game.json 或 assets.json 在保存期间被修改；请重新校验后再保存。');
    }
    // Never unlink the target first: a failed replace must leave the original intact.
    await fs.rename(temporary, target);
    committed = true;
    return { revision };
  } catch (error) {
    if (created && !committed) {
      try { await cleanTemporary(temporary); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], '保存失败，且临时文件清理失败。'); }
    }
    throw error;
  }
}

/**
 * Same-process saves to a work are serialized and use optimistic revision checks.
 * External editors must not write concurrently: Node does not provide a filesystem
 * compare-and-swap spanning the final revision check and atomic rename.
 */
export async function saveStoryDocument(gameDirectory: string, request: SaveStoryRequest): Promise<{ revision: string }> {
  if (!request || typeof request.expectedRevision !== 'string' || !/^[a-fA-F0-9]{64}$/.test(request.expectedRevision)) {
    throw new Error('保存需要有效的 expectedRevision；请先载入原文件。');
  }
  // Capture a private candidate before awaiting a queue or filesystem operation.
  const captured: SaveStoryRequest = { story: parseStory(request.story), expectedRevision: request.expectedRevision.toLowerCase() };
  const root = await resolveWork(gameDirectory);
  const key = process.platform === 'win32' ? root.toLowerCase() : root;
  const previous = saves.get(key) ?? Promise.resolve();
  const operation = previous.then(() => saveWithinLock(root, captured));
  const settled = operation.then(() => {}, () => {});
  saves.set(key, settled);
  try {
    return await operation;
  } finally {
    if (saves.get(key) === settled) saves.delete(key);
  }
}
