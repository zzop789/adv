import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { loadStoryDocument, saveStoryDocument, validateStoryDocument } from '../src/authoring/work-store';
import type { StoryDefinition } from '../src/runtime/types';
import { runStoryCommand } from '../tools/story.mjs';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function fixture(t: test.TestContext) {
  const prefix = path.join(os.tmpdir(), 'adv-story-store-');
  const directory = await fs.mkdtemp(prefix);
  t.after(async () => {
    const actual = path.resolve(directory);
    assert.equal(path.dirname(actual), path.resolve(os.tmpdir()));
    assert.ok(path.basename(actual).startsWith('adv-story-store-'));
    await fs.rm(actual, { recursive: true, force: true, maxRetries: 3 });
  });
  await fs.mkdir(path.join(directory, 'media'));
  await fs.writeFile(path.join(directory, 'media', '片段 one.webm'), 'test video');
  await fs.writeFile(path.join(directory, 'media', 'icon.ico'), 'test icon');
  const game = { schemaVersion: 2, id: 'demo', title: '测试作品', subtitle: '', description: '', entryNodeId: 'start', build: { executableName: 'Test', appId: 'com.adv.test', icon: 'media/icon.ico' } };
  const assets = { schemaVersion: 1, videos: { opening: { file: 'media/片段 one.webm' } } };
  const story: StoryDefinition = { schemaVersion: 1, nodes: [
    { id: 'start', type: 'video', mediaId: 'opening', next: 'end' },
    { id: 'end', type: 'end', title: '原结局', description: '' },
  ] };
  await fs.writeFile(path.join(directory, 'game.json'), '\uFEFF' + JSON.stringify(game));
  await fs.writeFile(path.join(directory, 'assets.json'), JSON.stringify(assets));
  await fs.writeFile(path.join(directory, 'story.json'), JSON.stringify(story));
  const target = path.join(directory, 'story.json');
  return { directory, target, game, assets, story };
}

function changeTitle(story: StoryDefinition, title: string): StoryDefinition {
  return { ...story, nodes: story.nodes.map((node) => node.type === 'end' ? { ...node, title } : { ...node }) };
}

async function assertNoTemporary(directory: string) {
  assert.deepEqual((await fs.readdir(directory)).filter((name) => name.startsWith('.story-')), []);
}

test('loads BOM JSON with exact byte revision and commits only story.json', async (t) => {
  const { directory, target, story } = await fixture(t);
  const original = Buffer.from(`\uFEFF${JSON.stringify(story)}\r\n`, 'utf8');
  await fs.writeFile(target, original);
  const gameBefore = await fs.readFile(path.join(directory, 'game.json'));
  const assetsBefore = await fs.readFile(path.join(directory, 'assets.json'));
  const loaded = await loadStoryDocument(directory);
  assert.deepEqual(loaded.story, story);
  assert.equal(loaded.revision, hash(original));
  const saved = await saveStoryDocument(directory, { story: changeTitle(story, '新结局'), expectedRevision: loaded.revision });
  const bytes = await fs.readFile(target);
  assert.equal(saved.revision, hash(bytes));
  assert.equal((await loadStoryDocument(directory)).revision, saved.revision);
  assert.deepEqual(JSON.parse(bytes.toString()), changeTitle(story, '新结局'));
  assert.deepEqual(await fs.readFile(path.join(directory, 'game.json')), gameBefore);
  assert.deepEqual(await fs.readFile(path.join(directory, 'assets.json')), assetsBefore);
  await assertNoTemporary(directory);
});

test('invalid drafts and missing current assets cannot replace the original', async (t) => {
  const { directory, target, story, assets } = await fixture(t);
  const original = await fs.readFile(target);
  const expectedRevision = hash(original);
  const invalid = { ...story, nodes: [{ id: 'other', type: 'end', title: '错误入口', description: '' }] };
  await assert.rejects(saveStoryDocument(directory, { story: invalid, expectedRevision }), /入口/);
  assets.videos.opening.file = 'media/missing.webm';
  await fs.writeFile(path.join(directory, 'assets.json'), JSON.stringify(assets));
  await assert.rejects(saveStoryDocument(directory, { story, expectedRevision }), /素材/);
  assert.deepEqual(await fs.readFile(target), original);
  await assertNoTemporary(directory);
});

test('parallel saves using one revision accept at most one write and reject stale revisions', async (t) => {
  const { directory, story } = await fixture(t);
  const { revision } = await loadStoryDocument(directory);
  const results = await Promise.allSettled([
    saveStoryDocument(directory, { story: changeTitle(story, '版本 A'), expectedRevision: revision }),
    saveStoryDocument(directory, { story: changeTitle(story, '版本 B'), expectedRevision: revision }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected?.status === 'rejected');
  assert.match(String(rejected.reason), /revision 冲突/);
  await assert.rejects(saveStoryDocument(directory, { story, expectedRevision: revision }), /revision 冲突/);
  await assertNoTemporary(directory);
});

test('validation and save can repair broken on-disk JSON without first writing the candidate', async (t) => {
  const { directory, target, story } = await fixture(t);
  const broken = Buffer.from('{ broken JSON');
  await fs.writeFile(target, broken);
  await assert.rejects(loadStoryDocument(directory), /JSON/);
  assert.deepEqual(await validateStoryDocument(directory, story), story);
  assert.deepEqual(await fs.readFile(target), broken);
  await saveStoryDocument(directory, { story, expectedRevision: hash(broken) });
  assert.deepEqual((await loadStoryDocument(directory)).story, story);
});

test('staging write failures preserve original bytes, clean temporary files, and release the save queue', async (t) => {
  const { directory, target, story } = await fixture(t);
  const original = await fs.readFile(target);
  const open = fs.open.bind(fs);
  const mock = t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    if (String(args[0]).includes('.story-')) {
      t.mock.method(handle, 'writeFile', async () => {
        await handle.write('partial staged bytes');
        throw new Error('simulated staging disk full');
      });
    }
    return handle;
  });
  await assert.rejects(saveStoryDocument(directory, { story: changeTitle(story, '不得保存'), expectedRevision: hash(original) }), /staging disk full/);
  assert.deepEqual(await fs.readFile(target), original);
  await assertNoTemporary(directory);
  mock.mock.restore();
  await saveStoryDocument(directory, { story, expectedRevision: hash(original) });
});

test('failed atomic replacement leaves the original and removes only its own staging file', async (t) => {
  const { directory, target, story } = await fixture(t);
  const original = await fs.readFile(target);
  const unrelated = path.join(directory, '.story-not-ours.tmp');
  await fs.writeFile(unrelated, 'keep me');
  const rename = fs.rename.bind(fs);
  t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
    if (String(args[1]) === target) throw new Error('simulated rename permission failure');
    return rename(...args);
  });
  await assert.rejects(saveStoryDocument(directory, { story, expectedRevision: hash(original) }), /rename permission/);
  assert.deepEqual(await fs.readFile(target), original);
  assert.equal(await fs.readFile(unrelated, 'utf8'), 'keep me');
  assert.deepEqual((await fs.readdir(directory)).filter((name) => name.startsWith('.story-')), ['.story-not-ours.tmp']);
});

test('a change to game.json during staging cancels commit and keeps the prior story', async (t) => {
  const { directory, target, story, game } = await fixture(t);
  const original = await fs.readFile(target);
  const open = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    if (String(args[0]).includes('.story-')) await fs.writeFile(path.join(directory, 'game.json'), JSON.stringify({ ...game, entryNodeId: 'changed' }));
    return handle;
  });
  await assert.rejects(saveStoryDocument(directory, { story, expectedRevision: hash(original) }), /game.json 或 assets.json/);
  assert.deepEqual(await fs.readFile(target), original);
  await assertNoTemporary(directory);
});

test('an external edit made during staging is detected before replacing story.json', async (t) => {
  const { directory, target, story } = await fixture(t);
  const original = await fs.readFile(target);
  const external = JSON.stringify(changeTitle(story, '外部编辑'));
  const open = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    if (String(args[0]).includes('.story-')) await fs.writeFile(target, external);
    return handle;
  });
  await assert.rejects(saveStoryDocument(directory, { story, expectedRevision: hash(original) }), /revision 冲突/);
  assert.equal(await fs.readFile(target, 'utf8'), external);
  await assertNoTemporary(directory);
});

test('directories and symbolic-link story targets are refused', async (t) => {
  const { directory, target, story } = await fixture(t);
  const original = await fs.readFile(target);
  await fs.unlink(target);
  await fs.mkdir(target);
  await assert.rejects(loadStoryDocument(directory), /普通文件/);
  await assert.rejects(saveStoryDocument(directory, { story, expectedRevision: hash(original) }), /普通文件/);
  await fs.rmdir(target);
  const outside = path.join(directory, 'outside.json');
  await fs.writeFile(outside, original);
  try {
    await fs.symlink(outside, target, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      const linkedDirectory = path.join(directory, 'linked-target');
      await fs.mkdir(linkedDirectory);
      await fs.symlink(linkedDirectory, target, 'junction');
      t.diagnostic('File symlink creation unavailable; verified a real Windows directory junction instead.');
    } else {
      throw error;
    }
  }
  assert.equal((await fs.lstat(target)).isSymbolicLink(), true);
  await assert.rejects(loadStoryDocument(directory), /普通文件/);
  await assert.rejects(saveStoryDocument(directory, { story, expectedRevision: hash(original) }), /普通文件/);
  assert.deepEqual(await fs.readFile(outside), original);
});

test('CLI dry-run exposes a revision and explicit writes reject stale authoring baselines', async (t) => {
  const { directory, story } = await fixture(t);
  const workspace = path.join(directory, 'cli-workspace');
  const work = path.join(workspace, 'games', 'demo');
  await fs.mkdir(work, { recursive: true });
  for (const name of ['game.json', 'assets.json', 'story.json', 'media']) {
    await fs.cp(path.join(directory, name), path.join(work, name), { recursive: true });
  }
  const input = path.join(directory, 'candidate.json');
  await fs.writeFile(input, JSON.stringify(changeTitle(story, '候选结局')));
  const target = path.join(work, 'story.json');
  const original = await fs.readFile(target);
  const args = ['--game', 'demo', '--input', input];
  const dryRun = await runStoryCommand(args, workspace);
  assert.match(dryRun, new RegExp(hash(original)));
  assert.match(dryRun, /未写入/);
  assert.deepEqual(await fs.readFile(target), original);
  await assert.rejects(runStoryCommand([...args, '--write'], workspace), /必须提供.*expected-revision/);
  const external = JSON.stringify(changeTitle(story, '新的外部版本'));
  await fs.writeFile(target, external);
  await assert.rejects(runStoryCommand([...args, '--write', '--expected-revision', hash(original)], workspace), /revision 冲突/);
  assert.equal(await fs.readFile(target, 'utf8'), external);
  const saved = await runStoryCommand([...args, '--write', '--expected-revision', hash(Buffer.from(external))], workspace);
  assert.match(saved, /已保存/);
  assert.deepEqual((await loadStoryDocument(work)).story, changeTitle(story, '候选结局'));
});

test('CLI validates and repairs invalid JSON from raw revision without loading the old story shape', async (t) => {
  const { directory, story } = await fixture(t);
  const workspace = path.join(directory, 'cli-workspace');
  const work = path.join(workspace, 'games', 'demo');
  await fs.mkdir(work, { recursive: true });
  for (const name of ['game.json', 'assets.json', 'story.json', 'media']) {
    await fs.cp(path.join(directory, name), path.join(work, name), { recursive: true });
  }
  const target = path.join(work, 'story.json');
  const broken = Buffer.from('{invalid old json');
  await fs.writeFile(target, broken);
  const input = path.join(directory, 'candidate.json');
  await fs.writeFile(input, '\uFEFF' + JSON.stringify(story));
  const args = ['--game', 'demo', '--input', input];
  assert.match(await runStoryCommand(args, workspace), new RegExp(hash(broken)));
  assert.deepEqual(await fs.readFile(target), broken);
  await runStoryCommand([...args, '--write', '--expected-revision', hash(broken)], workspace);
  assert.deepEqual((await loadStoryDocument(work)).story, story);
});
