import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AuthoringService } from '../src/desktop/authoring/service';

async function fixture(t: test.TestContext) {
  const base = await realpath('test-results');
  const directory = await mkdtemp(path.join(base, 'authoring-service-'));
  t.after(async () => {
    const target = await realpath(directory);
    assert.equal(path.dirname(target), base);
    assert.ok(path.basename(target).startsWith('authoring-service-'));
    await rm(target, { recursive: true, force: true });
  });
  await cp('games/demo', directory, { recursive: true });
  return { directory, service: new AuthoringService(directory, 'demo') };
}

await mkdir('test-results', { recursive: true });
test('editor reads metadata and saves a validated node effect without changing other files', async (t) => {
  const { directory, service } = await fixture(t);
  const doc = await service.read();
  assert.equal(doc.entryNodeId, 'opening');
  assert.ok(doc.mediaIds.includes('opening_video'));
  const gameBefore = await readFile(path.join(directory, 'game.json'));
  doc.story.nodes[0].effect = { preset: 'fade', durationMs: 250 };
  const valid = await service.validate(doc.story);
  const saved = await service.save({ story: valid.story, expectedRevision: doc.revision });
  assert.notEqual(saved.revision, doc.revision);
  assert.deepEqual((await service.read()).story.nodes[0].effect, { preset: 'fade', durationMs: 250 });
  assert.deepEqual(await readFile(path.join(directory, 'game.json')), gameBefore);
});

test('editor can inspect a disconnected graph but refuses to save it or overwrite newer content', async (t) => {
  const { directory, service } = await fixture(t);
  const doc = await service.read();
  const target = path.join(directory, 'story.json');
  const original = await readFile(target);
  const orphan = { id: 'orphan', type: 'end' as const, title: '草稿', description: '' };
  doc.story.nodes.push(orphan);
  await assert.rejects(service.save({ story: doc.story, expectedRevision: doc.revision }), /无法到达/);
  assert.deepEqual(await readFile(target), original);
  await writeFile(target, JSON.stringify(doc.story));
  assert.equal((await service.read()).story.nodes.at(-1)?.id, 'orphan');
  doc.story.nodes.pop();
  await assert.rejects(service.save({ story: doc.story, expectedRevision: doc.revision }), /revision/);
});

test('authoring refuses a mismatched work identity before read, validation or save', async (t) => {
  const { directory, service } = await fixture(t);
  const doc = await service.read();
  const other = new AuthoringService(directory, 'different-work');
  await assert.rejects(other.read(), /ID/);
  await assert.rejects(other.validate(doc.story), /ID/);
  await assert.rejects(other.save({ story: doc.story, expectedRevision: doc.revision }), /ID/);
});
