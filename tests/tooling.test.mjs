import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertOutputChild, assertUniqueWorkIdentities, createStaging, distRoot, parseArguments, publishStaging,
  readWork, removeOutput, root,
} from '../tools/workspace.mjs';

test('tool arguments select a work without shell interpolation', () => {
  assert.equal(parseArguments([]).game, 'demo');
  assert.equal(parseArguments(['--game', 'afterglow']).game, 'afterglow');
  assert.equal(parseArguments(['--game=afterglow']).game, 'afterglow');
  assert.ok(parseArguments(['--built', '--game', 'demo'], ['--built']).flags.has('--built'));
  assert.ok(parseArguments(['--all'], ['--all']).flags.has('--all'));
});

test('tool arguments reject ambiguous work selection and path traversal', () => {
  for (const args of [['--game'], ['--game', '../demo'], ['--game', 'a/b'], ['--wat'], ['--game', 'demo', '--game', 'afterglow']]) {
    assert.throws(() => parseArguments(args));
  }
  assert.throws(() => parseArguments(['--all', '--game', 'demo'], ['--all']));
});

test('work discovery rejects path traversal before reading files', async () => {
  await assert.rejects(readWork('../demo'), /无效/);
});

test('packaging one work detects identity conflicts with unselected works', () => {
  const works = [
    { id: 'demo', config: { build: { appId: 'com.adv.demo', executableName: 'FogHarbor' } } },
    { id: 'afterglow', config: { build: { appId: 'com.adv.demo', executableName: 'AfterglowLetter' } } },
  ];
  assert.throws(() => assertUniqueWorkIdentities(works, ['demo']), /appId/);
  works[1].config.build.appId = 'com.adv.afterglow';
  works[1].config.build.executableName = 'fogharbor';
  assert.throws(() => assertUniqueWorkIdentities(works, ['demo']), /executableName/);
  works[1].config.build.executableName = 'AfterglowLetter';
  assert.doesNotThrow(() => assertUniqueWorkIdentities(works, ['demo']));
});

test('output operations cannot target workspace, output root, or sibling source', async () => {
  await assert.rejects(assertOutputChild(root, path.join(root, 'games')));
  await assert.rejects(assertOutputChild(distRoot, distRoot));
  await assert.rejects(assertOutputChild(distRoot, path.join(root, 'games')));
  await assert.rejects(assertOutputChild(distRoot, path.join(distRoot, 'demo', 'nested')));
});

test('failed publishing restores the previous successful output', async () => {
  const previous = await createStaging(distRoot, 'test-previous');
  const missing = path.join(distRoot, `.missing-${path.basename(previous)}`);
  try {
    await writeFile(path.join(previous, 'success.txt'), 'previous build');
    await assert.rejects(publishStaging(distRoot, missing, previous));
    assert.equal(await readFile(path.join(previous, 'success.txt'), 'utf8'), 'previous build');
  } finally {
    await removeOutput(distRoot, previous);
  }
});
