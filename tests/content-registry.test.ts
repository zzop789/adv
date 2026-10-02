import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ContentRegistry } from '../src/desktop/content-registry';
import type { GameContent } from '../src/desktop/content';

async function fixture(t: test.TestContext) {
  const base = await realpath(tmpdir());
  const root = await mkdtemp(path.join(base, 'adv-content-registry-'));
  t.after(async () => {
    const target = await realpath(root);
    assert.equal(path.dirname(target), base);
    assert.ok(path.basename(target).startsWith('adv-content-registry-'));
    await rm(target, { recursive: true, force: true });
  });
  const firstFile = path.join(root, 'first.webm');
  const nextFile = path.join(root, 'next.webm');
  await writeFile(firstFile, 'old clip');
  await writeFile(nextFile, 'new clip');
  function content(file: string): GameContent {
    return {
      game: { id: 'sample', title: 'Sample', subtitle: '', description: '', entryNodeId: 'end' },
      build: { executableName: 'Sample', appId: 'com.adv.sample', icon: 'media/icon.ico' },
      story: { schemaVersion: 1, nodes: [{ id: 'end', type: 'end', title: 'End', description: '' }] },
      root,
      videos: new Map([['clip', file]]),
    };
  }
  return { registry: new ContentRegistry(), content, firstFile, nextFile };
}

test('old and new players resolve the same media ID through separate content leases', async (t) => {
  const { registry, content, firstFile, nextFile } = await fixture(t);
  const first = registry.register(content(firstFile), true);
  const next = registry.register(content(nextFile), true);
  assert.notEqual(first.loadId, next.loadId);
  assert.equal(first.previewEnabled, true);
  assert.equal(await (await registry.serve(new Request(first.videoUrls.clip))).text(), 'old clip');
  assert.equal(await (await registry.serve(new Request(next.videoUrls.clip))).text(), 'new clip');
  registry.release(first.loadId);
  assert.equal((await registry.serve(new Request(first.videoUrls.clip))).status, 404);
  assert.equal(await (await registry.serve(new Request(next.videoUrls.clip))).text(), 'new clip');
  registry.release(first.loadId); // Cleanup is safe to repeat.
});

test('registration copies the media mapping and release does not affect a different load', async (t) => {
  const { registry, content, firstFile, nextFile } = await fixture(t);
  const candidate = content(firstFile);
  const loaded = registry.register(candidate, false);
  (candidate.videos as Map<string, string>).set('clip', nextFile);
  assert.equal(loaded.previewEnabled, false);
  assert.equal(await (await registry.serve(new Request(loaded.videoUrls.clip))).text(), 'old clip');
  registry.release('unknown');
  assert.equal((await registry.serve(new Request(loaded.videoUrls.clip))).status, 200);
  registry.clear();
  assert.equal((await registry.serve(new Request(loaded.videoUrls.clip))).status, 404);
});

test('versioned media keeps range and HEAD support while rejecting unknown routes', async (t) => {
  const { registry, content, firstFile } = await fixture(t);
  const loaded = registry.register(content(firstFile), true);
  const response = await registry.serve(new Request(loaded.videoUrls.clip, { headers: { range: 'bytes=1-3' } }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 1-3/8');
  assert.equal(await response.text(), 'ld ');
  const head = await registry.serve(new Request(loaded.videoUrls.clip, { method: 'HEAD' }));
  assert.equal(head.headers.get('content-length'), '8');
  assert.equal(await head.text(), '');
  for (const url of [
    'adv-media://asset/clip',
    `adv-media://asset/${loaded.loadId}/missing`,
    `${loaded.videoUrls.clip}?file=other`,
    `${loaded.videoUrls.clip}#fragment`,
    `adv-media://other/${loaded.loadId}/clip`,
    `adv-media://asset/${loaded.loadId}/../clip`,
  ]) assert.equal((await registry.serve(new Request(url))).status, 404);
  assert.equal((await registry.serve(new Request(loaded.videoUrls.clip, { method: 'POST' }))).status, 405);
});
