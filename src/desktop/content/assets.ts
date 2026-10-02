import path from 'node:path';
import { requireMediaDirectory, resolveContentFile } from './paths';

export async function resolveVideos(root: string, assets: Record<string, { file: string }>) {
  const videos = new Map<string, string>();
  for (const [id, asset] of Object.entries(assets)) {
    requireMediaDirectory(asset.file);
    if (!['.mp4', '.webm'].includes(path.extname(asset.file).toLowerCase())) {
      throw new Error(`素材 ${id} 需要使用 MP4 或 WebM 文件。`);
    }
    try { videos.set(id, await resolveContentFile(root, asset.file)); }
    catch (error) { throw new Error(`素材 ${id} 无法读取，请检查文件是否存在且位于作品目录内。`, { cause: error }); }
  }
  return videos;
}

export async function validateIcon(root: string, icon: string): Promise<void> {
  if (path.extname(icon).toLowerCase() !== '.ico') throw new Error('作品图标必须是 ICO 文件。');
  requireMediaDirectory(icon);
  try { await resolveContentFile(root, icon); }
  catch (error) { throw new Error('作品图标无法读取，请检查 build.icon。', { cause: error }); }
}
