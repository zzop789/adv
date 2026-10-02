import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { isInside } from '../content/paths';

/** Recheck a leased path, then serve the checked descriptor rather than reopening it. */
export async function openMediaFile(root: string, file: string) {
  const anchor = path.resolve(root);
  if (!isInside(anchor, path.resolve(file)) || await realpath(anchor) !== anchor) {
    throw new Error('素材作品目录发生变化。');
  }
  const actual = await realpath(file);
  if (!isInside(anchor, actual)) throw new Error('素材链接不能指向作品目录之外。');
  const handle = await open(actual, 'r');
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || await realpath(anchor) !== anchor || await realpath(file) !== actual) {
      throw new Error('素材路径在打开期间发生变化。');
    }
    const current = await stat(actual);
    if (current.dev !== opened.dev || current.ino !== opened.ino) {
      throw new Error('素材文件在打开期间发生变化。');
    }
    return { handle, size: opened.size };
  } catch (error) {
    await handle.close();
    throw error;
  }
}
