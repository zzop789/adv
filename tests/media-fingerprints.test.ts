import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, realpath, rm, writeFile, stat, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fingerprint, mediaFingerprints } from '../src/desktop/content/fingerprints';

test('media hashes identify bytes, stay stable across paths and notice same-size rewrites', async () => {
  await mkdir('test-results', { recursive: true });
  const base = await realpath('test-results');
  const root = await mkdtemp(path.join(base, 'fingerprints-'));
  try {
    const first = path.join(root, 'one.webm');
    const second = path.join(root, 'two.webm');
    await writeFile(first, 'old clip');
    await writeFile(second, 'old clip');
    const old = createHash('sha256').update('old clip').digest('hex');
    assert.equal(await fingerprint(first), old);
    assert.equal(await fingerprint(second), old);
    const originalTime = await stat(first);
    await writeFile(first, 'new clip');
    await utimes(first, originalTime.atime, originalTime.mtime);
    assert.equal(await fingerprint(first), createHash('sha256').update('new clip').digest('hex'));
    assert.deepEqual(await mediaFingerprints(new Map([['a', first], ['b', second]])), {
      a: createHash('sha256').update('new clip').digest('hex'), b: old,
    });
  } finally {
    const target = await realpath(root);
    assert.equal(path.dirname(target), base);
    assert.ok(path.basename(target).startsWith('fingerprints-'));
    await rm(target, { recursive: true, force: true });
  }
});
