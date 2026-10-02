import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import electronPath from 'electron';
import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { buildDesktop } from './build-desktop.mjs';
import { writeAppManifest } from './build.mjs';
import { readWork, root } from './workspace.mjs';

// Every mutation stays in this ignored fixture; the actual demo is never edited.
const output = path.join(root, 'test-results');
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(output, 'preview 中文 '));
const directory = path.join(fixture, 'game');
const application = path.join(fixture, 'app');
await cp(path.join(root, 'games/demo'), directory, { recursive: true });
const base = await readWork('demo');
const config = structuredClone(base.config);
config.build.appId = 'com.adv.previewsmoke';
await writeFile(path.join(directory, 'game.json'), JSON.stringify(config));
const work = { ...base, directory, config };
const storyPath = path.join(directory, 'story.json');
const assetsPath = path.join(directory, 'assets.json');
const story = JSON.parse(await readFile(storyPath, 'utf8'));
const assets = JSON.parse(await readFile(assetsPath, 'utf8'));
const opening = story.nodes.find((node) => node.id === config.entryNodeId);
const choice = story.nodes.find((node) => node.id === opening.next);
assert.equal(opening.type, 'video');
assert.equal(choice.type, 'choice');
const firstBranch = story.nodes.find((node) => node.id === choice.options[0].next);
const secondBranch = story.nodes.find((node) => node.id === choice.options[1].next);
const lighthouseFile = assets.videos[firstBranch.mediaId].file;
const shoreFile = assets.videos[secondBranch.mediaId].file;

const oldGame = process.env.ADV_GAME_ID;
process.env.ADV_GAME_ID = 'demo';
let server;
let app;
try {
  await mkdir(application, { recursive: true });
  await buildDesktop(work, application, { development: true });
  await writeAppManifest(work, application);
  server = await createServer({ root, configFile: path.join(root, 'vite.config.ts') });
  await server.listen();
  const env = { ...process.env, ADV_SMOKE_TEST: '1', ADV_DEV_SERVER_URL: 'http://127.0.0.1:5173' };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: electronPath, args: [application], cwd: root, env, timeout: 45000 });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  const failures = [];
  const mediaRequests = new Set();
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('request', (request) => { if (request.url().startsWith('adv-media:')) mediaRequests.add(request.url()); });
  const reloadButton = () => page.getByRole('button', { name: '重新载入预览（从头开始）', exact: true });
  const videoState = () => page.locator('video').evaluate((video) => ({
    src: video.src, time: video.currentTime, paused: video.paused, identity: video.dataset.previewIdentity,
  }));
  const ready = () => page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  async function remote(url) {
    return app.evaluate(async ({ net }, source) => {
      const response = await net.fetch(source);
      return { status: response.status, data: Buffer.from(await response.arrayBuffer()).toString('base64') };
    }, url);
  }
  async function assertFile(url, file) {
    const result = await remote(url);
    assert.equal(result.status, 200);
    const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(Buffer.from(result.data, 'base64')), hash(await readFile(path.join(directory, file))));
  }
  async function finishClip() {
    await ready();
    if ((await videoState()).paused) await page.getByRole('button', { name: '播放', exact: true }).click();
    const duration = await page.locator('video').evaluate((video) => video.duration);
    await page.getByRole('slider', { name: '播放进度', exact: true }).fill(String(duration - .7));
  }

  await ready();
  await reloadButton().waitFor();
  const screenshot = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    await window.capturePage(undefined, { stayAwake: true });
    return (await window.capturePage(undefined, { stayAwake: true })).toPNG().toString('base64');
  });
  await writeFile(path.join(output, 'preview-tools.png'), Buffer.from(screenshot, 'base64'));
  await page.locator('video').evaluate((video) => { video.dataset.previewIdentity = 'original'; });
  const original = await videoState();
  choice.prompt = '预览版本二：新剧情已经载入';
  assets.videos[opening.mediaId].file = lighthouseFile;
  await writeFile(storyPath, JSON.stringify(story));
  await writeFile(assetsPath, JSON.stringify(assets));
  assert.deepEqual(await videoState(), original, 'Files must not implicitly reset an active preview');
  mediaRequests.clear();
  await reloadButton().evaluate((button) => { button.click(); button.click(); button.click(); });
  await page.waitForFunction((source) => document.querySelector('video')?.src !== source, original.src);
  await ready();
  await reloadButton().waitFor();
  await page.waitForTimeout(200);
  const second = await videoState();
  assert.equal(second.identity, undefined, 'Successful reload creates a fresh Player');
  assert.equal(second.paused, true, 'Reload waits for manual playback at the entry');
  assert.equal(second.time, 0);
  assert.equal(new Set([...mediaRequests].filter((url) => url.endsWith('/' + opening.mediaId))).size, 1, 'Rapid repeated clicks must produce only one loaded version');
  await assertFile(second.src, lighthouseFile);
  assert.equal((await remote(original.src)).status, 404, 'Retired Player content is released after teardown');
  await finishClip();
  await page.getByRole('heading', { name: choice.prompt, exact: true }).waitFor();
  assert.equal(await page.getByRole('slider', { name: '播放进度', exact: true }).count(), 0);

  // Reload into the same entry, pause partway, then offer a malformed candidate.
  await reloadButton().click();
  await page.waitForFunction((source) => document.querySelector('video')?.src !== source, second.src);
  await ready();
  await page.getByRole('button', { name: '开始播放', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('slider', { name: '播放进度', exact: true }).fill('2');
  await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 2) < .1);
  await page.locator('video').evaluate((video) => { video.dataset.previewIdentity = 'keep-on-error'; });
  const beforeFailure = await videoState();
  assets.videos[opening.mediaId].file = shoreFile;
  await writeFile(assetsPath, JSON.stringify(assets));
  await writeFile(storyPath, '{ deliberately invalid JSON');
  await reloadButton().click();
  await page.getByRole('alert').filter({ hasText: '重新载入失败，当前播放已保留' }).waitFor();
  await reloadButton().waitFor();
  assert.deepEqual(await videoState(), beforeFailure, 'Invalid candidate keeps the prior Player and position');
  await assertFile(beforeFailure.src, lighthouseFile);
  await page.getByRole('button', { name: '继续播放', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video').currentTime > 2.1);
  await page.getByRole('button', { name: '暂停', exact: true }).click();

  // Repair and retry without restarting the desktop app or losing the work source.
  choice.prompt = '预览版本三：修复后可以继续制作';
  await writeFile(storyPath, JSON.stringify(story));
  await reloadButton().click();
  await page.waitForFunction((source) => document.querySelector('video')?.src !== source, beforeFailure.src);
  await ready();
  await reloadButton().waitFor();
  const third = await videoState();
  assert.equal(third.paused, true);
  assert.equal(third.time, 0);
  assert.equal(await page.getByRole('alert').count(), 0);
  await assertFile(third.src, shoreFile);
  await finishClip();
  await page.getByRole('heading', { name: choice.prompt, exact: true }).waitFor();
  assert.deepEqual(failures, []);
  console.log('PASS preview: explicit reload, updated story and media, fresh entry/manual start, serial rapid clicks, retired-version release, malformed JSON preserves Player/video/mapping, repair and retry.');
  console.log(`Fixture kept for inspection: ${fixture}`);
} finally {
  if (app) await app.close();
  if (server) await server.close();
  if (oldGame === undefined) delete process.env.ADV_GAME_ID;
  else process.env.ADV_GAME_ID = oldGame;
}
