import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadGameContent, resolveContentFile } from '../src/desktop/content';

async function fixture(t: test.TestContext) {
  const prefix = path.join(os.tmpdir(), 'adv-content-test-');
  const directory = await mkdtemp(prefix);
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(prefix)));
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(path.join(directory, 'media'));
  await writeFile(path.join(directory, 'media', '片段 one.webm'), 'test video placeholder');
  await writeFile(path.join(directory, 'media', 'icon.ico'), 'test icon placeholder');
  const game = { schemaVersion: 2, id: 'demo', title: '测试作品', subtitle: '序幕', description: '测试', entryNodeId: 'start', build: { executableName: 'Test', appId: 'com.adv.test', icon: 'media/icon.ico' } };
  const story = { schemaVersion: 1, nodes: [
    { id: 'start', type: 'video', mediaId: 'opening', next: 'end' },
    { id: 'end', type: 'end', title: '结束', description: '测试' },
  ] };
  const assets = { schemaVersion: 1, videos: { opening: { file: 'media/片段 one.webm' } } };
  await writeFile(path.join(directory, 'game.json'), '\uFEFF' + JSON.stringify(game));
  await writeFile(path.join(directory, 'assets.json'), JSON.stringify(assets));
  await writeFile(path.join(directory, 'story.json'), JSON.stringify(story));
  return { directory, game, assets };
}

test('loads a BOM-prefixed config and resolves a Unicode filename through its stable ID', async (t) => {
  const { directory } = await fixture(t);
  const content = await loadGameContent(directory);
  assert.equal(content.game.entryNodeId, 'start');
  assert.equal(content.game.title, '测试作品');
  assert.equal(path.basename(content.videos.get('opening')!), '片段 one.webm');
});

test('rejects an entry node that is absent from the story', async (t) => {
  const { directory, game } = await fixture(t);
  await writeFile(path.join(directory, 'game.json'), JSON.stringify({ ...game, entryNodeId: 'missing' }));
  await assert.rejects(loadGameContent(directory), /入口/);
});

test('rejects invalid schema versions and missing video files', async (t) => {
  const { directory, game, assets } = await fixture(t);
  await writeFile(path.join(directory, 'game.json'), JSON.stringify({ ...game, schemaVersion: 99 }));
  await assert.rejects(loadGameContent(directory), /game.json/);
  await writeFile(path.join(directory, 'game.json'), JSON.stringify(game));
  assets.videos.opening.file = 'media/missing.mp4';
  await writeFile(path.join(directory, 'assets.json'), JSON.stringify(assets));
  await assert.rejects(loadGameContent(directory), /素材 opening 无法读取/);
});

test('refuses paths outside the work including Windows absolute and traversal paths', async (t) => {
  const { directory } = await fixture(t);
  for (const bad of ['../outside.webm', '..\\outside.webm', 'C:\\outside.webm', '/outside.webm', '//server/share.webm']) {
    await assert.rejects(resolveContentFile(directory, bad));
  }
});

test('requires media and icons to live in the directory copied into a product', async (t) => {
  const { directory, game, assets } = await fixture(t);
  await mkdir(path.join(directory, 'clips'));
  await writeFile(path.join(directory, 'clips', 'video.webm'), 'placeholder');
  assets.videos.opening.file = 'media/../clips/video.webm';
  await writeFile(path.join(directory, 'assets.json'), JSON.stringify(assets));
  await assert.rejects(loadGameContent(directory), /media\//);
  assets.videos.opening.file = 'media/片段 one.webm';
  await writeFile(path.join(directory, 'assets.json'), JSON.stringify(assets));
  await writeFile(path.join(directory, 'game.json'), JSON.stringify({ ...game, build: { ...game.build, icon: 'brand.ico' } }));
  await assert.rejects(loadGameContent(directory), /media\//);
});
