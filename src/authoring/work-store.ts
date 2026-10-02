import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { loadGameContent } from '../desktop/content';
import { storySchema } from '../runtime/story-schema';
import type { StoryDefinition } from '../runtime/types';

export interface StoredStoryDocument {
  story: StoryDefinition;
  /** SHA-256 of the exact on-disk bytes, including BOM and whitespace. */
  revision: string;
}

export interface SaveStoryRequest {
  story: unknown;
  expectedRevision: string;
}

const saves = new Map<string, Promise<void>>();
const revisionOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function resolveWork(gameDirectory: string): Promise<string> {
  const root = await fs.realpath(gameDirectory);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('作品路径必须是目录。');
  return root;
}

async function readStoryBytes(root: string): Promise<{ bytes: Buffer; mode: number }> {
  if (await fs.realpath(root) !== root) throw new Error('作品目录在读取期间发生变化，请重新载入。');
  const target = path.join(root, 'story.json');
  const info = await fs.lstat(target);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('story.json 必须是作品目录内的普通文件，不能是符号链接或目录。');
  if (await fs.realpath(target) !== target) throw new Error('story.json 不能指向作品目录之外。');
  const bytes = await fs.readFile(target);
  const after = await fs.lstat(target);
  if (after.isSymbolicLink() || !after.isFile() || after.dev !== info.dev || after.ino !== info.ino
    || after.size !== info.size || after.mtimeMs !== info.mtimeMs) {
    throw new Error('story.json 在读取期间发生变化，请重新载入。');
  }
  return { bytes, mode: info.mode & 0o777 };
}

function parseStory(value: unknown): StoryDefinition {
  const parsed = storySchema.safeParse(value);
  if (!parsed.success) throw new Error('story.json 格式不正确，请检查节点字段和 schemaVersion。');
  return parsed.data;
}

/** Reads an editable document's shape; full game validation is a separate operation. */
export async function loadStoryDocument(gameDirectory: string): Promise<StoredStoryDocument> {
  const root = await resolveWork(gameDirectory);
  const { bytes } = await readStoryBytes(root);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error('story.json 无法解析，请检查 JSON 格式。', { cause: error });
  }
  return { story: parseStory(value), revision: revisionOf(bytes) };
}

/** Validates only the candidate against the current game, assets and local media. */
export async function validateStoryDocument(gameDirectory: string, story: unknown): Promise<StoryDefinition> {
  const candidate = parseStory(story);
  return (await loadGameContent(gameDirectory, { story: candidate })).story;
}

async function configurationBytes(root: string): Promise<[Buffer, Buffer]> {
  return Promise.all([fs.readFile(path.join(root, 'game.json')), fs.readFile(path.join(root, 'assets.json'))]);
}

async function cleanTemporary(file: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.unlink(file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '') || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

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
