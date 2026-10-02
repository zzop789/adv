import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const revisionOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function resolveWork(gameDirectory: string): Promise<string> {
  const root = await fs.realpath(gameDirectory);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('作品路径必须是目录。');
  return root;
}

export async function readStoryBytes(root: string): Promise<{ bytes: Buffer; mode: number }> {
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
