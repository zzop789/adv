import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, realpath, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ContentRegistry } from '../src/desktop/content/registry';
import type { GameContent } from '../src/desktop/content/types';
import { serveLocalMedia } from '../src/desktop/media/serve';

async function fixture(t: test.TestContext) {
  const base = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(base, 'adv-media-paths-'));
  const links: string[] = [];
  t.after(async () => {
    for (const link of links) await unlink(link);
    const actual = await realpath(directory);
    assert.equal(path.dirname(actual), base);
    assert.ok(path.basename(actual).startsWith('adv-media-paths-'));
    await rm(actual, { recursive: true, force: true });
  });
  const root = path.join(directory, 'work');
  const outside = path.join(directory, 'outside');
  const media = path.join(root, 'media');
  await mkdir(media, { recursive: true });
  await mkdir(outside);
  const file = path.join(media, 'clip.webm');
  await writeFile(file, 'inside');
  await writeFile(path.join(outside, 'clip.webm'), 'outside');
  const content: GameContent = {
    root, videos: new Map([['clip', file]]),
    game: { id: 'test', title: 'Test', subtitle: '', description: '', entryNodeId: 'end' },
    build: { executableName: 'Test', appId: 'com.adv.test', icon: 'media/icon.ico' },
    story: { schemaVersion: 1, nodes: [{ id: 'end', type: 'end', title: 'End', description: '' }] },
  };
  const registry = new ContentRegistry();
  const loaded = registry.register(content, true);
  async function replaceWithLink(target: string, link: string) {
    await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    links.push(link);
  }
  return { content, root, media, file, outside, directory, registry, loaded, replaceWithLink };
}

test('an existing lease refuses a media directory replaced by an outside junction', async (t) => {
  const f = await fixture(t);
  assert.equal(await (await f.registry.serve(new Request(f.loaded.videoUrls.clip))).text(), 'inside');
  await rename(f.media, path.join(f.root, 'original-media'));
  await f.replaceWithLink(f.outside, f.media);
  for (const method of ['GET', 'HEAD']) {
    assert.equal((await f.registry.serve(new Request(f.loaded.videoUrls.clip, { method }))).status, 404);
  }
});

test('an existing lease refuses a work root redirected after loading', async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.outside, 'media'));
  await writeFile(path.join(f.outside, 'media', 'clip.webm'), 'outside');
  await rename(f.root, path.join(f.directory, 'original-work'));
  await f.replaceWithLink(f.outside, f.root);
  assert.equal((await f.registry.serve(new Request(f.loaded.videoUrls.clip))).status, 404);
});

test('media serving rejects direct out-of-root mappings and directories', async (t) => {
  const f = await fixture(t);
  const request = new Request('adv-media://asset/clip');
  for (const file of [path.join(f.outside, 'clip.webm'), f.media]) {
    assert.equal((await serveLocalMedia(request, { ...f.content, videos: new Map([['clip', file]]) })).status, 404);
  }
});

test('a response retains its checked open file after the path is replaced', async (t) => {
  const f = await fixture(t);
  const response = await f.registry.serve(new Request(f.loaded.videoUrls.clip));
  assert.equal(response.status, 200);
  await rename(f.file, path.join(f.media, 'old-clip.webm'));
  await writeFile(f.file, 'new clip');
  assert.equal(await response.text(), 'inside');
  assert.equal(await (await f.registry.serve(new Request(f.loaded.videoUrls.clip))).text(), 'new clip');
});
