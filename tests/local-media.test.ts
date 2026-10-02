import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseByteRange, serveLocalMedia } from '../src/desktop/local-media';
import type { GameContent } from '../src/desktop/content';

test('supports bounded, open-ended and suffix ranges; refuses invalid and multiple ranges', () => {
  assert.deepEqual(parseByteRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(parseByteRange('bytes=8-', 10), { start: 8, end: 9 });
  assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=8-100', 10), { start: 8, end: 9 });
  for (const range of ['bytes=10-', 'bytes=6-3', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'nonsense']) {
    assert.equal(parseByteRange(range, 10), null);
  }
});

test('serves real partial bytes for seeking and does not expose unmapped files', async (t) => {
  const prefix = path.join(os.tmpdir(), 'adv-media-test-');
  const directory = await mkdtemp(prefix);
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(prefix)));
    await rm(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, 'test.webm');
  await writeFile(file, '0123456789');
  const content: GameContent = {
    root: directory,
    game: { id: 'test', title: '', subtitle: '', description: '', entryMediaId: 'opening' },
    videos: new Map([['opening', file]]),
  };
  const partial = await serveLocalMedia(new Request('adv-media://asset/opening', { headers: { Range: 'bytes=2-5' } }), content);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await partial.text(), '2345');
  const invalid = await serveLocalMedia(new Request('adv-media://asset/opening', { headers: { Range: 'bytes=11-' } }), content);
  assert.equal(invalid.status, 416);
  const missing = await serveLocalMedia(new Request('adv-media://asset/test.webm'), content);
  assert.equal(missing.status, 404);
  const wrongHost = await serveLocalMedia(new Request('adv-media://other/opening'), content);
  assert.equal(wrongHost.status, 404);
  const head = await serveLocalMedia(new Request('adv-media://asset/opening', { method: 'HEAD' }), content);
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal(await head.text(), '');
});
