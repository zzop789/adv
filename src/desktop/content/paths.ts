import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function resolveContentFile(root: string, relativeFile: string): Promise<string> {
  // Both separators are treated as paths even when authoring/testing on another OS.
  const normalized = relativeFile.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized) || normalized.includes(':')) {
    throw new Error('素材路径必须是作品目录内的相对路径。');
  }
  const absolute = path.resolve(root, normalized);
  if (!isInside(root, absolute)) throw new Error('素材路径不能越出作品目录。');
  const [actualRoot, actualFile] = await Promise.all([realpath(root), realpath(absolute)]);
  if (!isInside(actualRoot, actualFile)) throw new Error('素材链接不能指向作品目录之外。');
  if (!(await stat(actualFile)).isFile()) throw new Error('素材必须是文件。');
  return actualFile;
}

export async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${path.basename(file)} 无法读取，请检查文件是否存在且为有效 JSON。`, { cause: error });
  }
}

export function requireMediaDirectory(file: string): void {
  const normalized = path.posix.normalize(file.replaceAll('\\', '/'));
  if (!normalized.startsWith('media/')) throw new Error('视频和图标必须放在作品的 media/ 目录内，保证构建时完整复制。');
}
