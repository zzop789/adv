import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const cache = new Map<string, { signature: string; hash: string }>();
async function signature(file: string): Promise<string> {
  const info = await stat(file, { bigint: true });
  return [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(':');
}

/** Stream bytes once; invalidate cached hashes when identity, size or write metadata changes. */
export async function fingerprint(file: string): Promise<string> {
  const before = await signature(file);
  const previous = cache.get(file);
  if (previous?.signature === before) return previous.hash;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (await signature(file) !== before) throw new Error('视频在读取期间发生变化，请等待文件保存完成后重试。');
  const digest = hash.digest('hex');
  if (cache.size >= 1024) cache.delete(cache.keys().next().value!);
  cache.set(file, { signature: before, hash: digest });
  return digest;
}

export async function mediaFingerprints(videos: ReadonlyMap<string, string>): Promise<Record<string, string>> {
  const revisions: Record<string, string> = {};
  // Sequential streaming bounds open handles and disk pressure for large projects.
  for (const [id, file] of videos) revisions[id] = await fingerprint(file);
  return revisions;
}
