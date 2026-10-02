import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import electronPath from 'electron';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const output = path.join(root, 'test-results');
await mkdir(output, { recursive: true });
// All fault injection happens in an isolated copied build, never in the work.
const fixture = await mkdtemp(path.join(output, 'smoke-'));
for (const name of ['dist', 'dist-electron', 'games/demo']) {
  await cp(path.join(root, name), path.join(fixture, name), { recursive: true });
}
await writeFile(path.join(fixture, 'package.json'), JSON.stringify({ name: 'adv-smoke-fixture', main: 'dist-electron/main.cjs' }));
const env = { ...process.env, ADV_SMOKE_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ADV_DEV_SERVER_URL;
const failures = [];

async function launch() {
  const app = await electron.launch({ executablePath: electronPath, args: [fixture], env, timeout: 45_000 });
  const page = await app.firstWindow();
  page.on('pageerror', (error) => failures.push(error.message));
  return { app, page };
}

let instance;
try {
  instance = await launch();
  const { app, page } = instance;
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  assert.equal(await page.title(), '雾港');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.ok(await page.evaluate(() => document.querySelector('video').duration >= 11));
  const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.nodeIntegration, false);

  // Local custom protocols keep working with browser networking disabled.
  await app.context().setOffline(true);
  await page.getByRole('button', { name: '开始播放', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video').currentTime > 0.6);
  await page.screenshot({ path: path.join(output, 'playing.png') });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  assert.equal(await page.evaluate(() => document.querySelector('video').paused), true);
  const pausedTime = await page.evaluate(() => document.querySelector('video').currentTime);
  await page.waitForTimeout(250);
  assert.ok(Math.abs(await page.evaluate(() => document.querySelector('video').currentTime) - pausedTime) < 0.05);

  const originalVideoId = await page.evaluate(() => {
    const video = document.querySelector('video');
    video.dataset.smokeIdentity = 'persistent';
    return video.dataset.smokeIdentity;
  });
  await page.getByRole('slider', { name: '播放进度' }).fill('6');
  await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 6) < 0.2);
  await page.getByRole('slider', { name: '音量' }).fill('0.35');
  assert.ok(Math.abs(await page.evaluate(() => document.querySelector('video').volume) - 0.35) < 0.01);
  assert.equal(await page.evaluate(() => document.querySelector('video').dataset.smokeIdentity), originalVideoId);

  await page.getByRole('button', { name: '继续播放', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video').currentTime > 6.2);
  await page.getByRole('slider', { name: '播放进度' }).fill('11.7');
  await page.getByRole('button', { name: '重新观看', exact: true }).waitFor();
  await page.getByRole('button', { name: '重新观看', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('video').paused && document.querySelector('video').currentTime < 3);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'paused.png') });

  await page.getByRole('button', { name: '切换全屏', exact: true }).click();
  await page.waitForFunction(async () => await window.adv.getFullscreen());
  await page.keyboard.press('Escape');
  await page.waitForFunction(async () => !(await window.adv.getFullscreen()));
  console.log('PASS: Escape exits fullscreen even while the fullscreen button has focus');

  // Verify layout fits the minimum supported PC window.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 680));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight), true);
  await page.screenshot({ path: path.join(output, 'compact.png') });
  console.log('PASS: offline playback, pause, seek, volume, end, replay, persistent video and minimum-width layout');
  await app.close();
  instance = null;

  const assetsPath = path.join(fixture, 'games/demo/assets.json');
  const assets = JSON.parse(await readFile(assetsPath, 'utf8'));
  assets.videos.opening_video.file = 'media/替换视频 sample.webm';
  await cp(path.join(fixture, 'games/demo/media/opening.webm'), path.join(fixture, 'games/demo/media/替换视频 sample.webm'));
  await writeFile(assetsPath, JSON.stringify(assets));
  instance = await launch();
  await instance.page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  console.log('PASS: replacing media through the manifest, including Unicode and spaces in the filename');
  await instance.app.close();
  instance = null;

  assets.videos.opening_video.file = 'media/not-present.mp4';
  await writeFile(assetsPath, JSON.stringify(assets));
  instance = await launch();
  await instance.page.getByRole('alert').filter({ hasText: '素材 opening_video 无法读取' }).waitFor();
  await instance.page.screenshot({ path: path.join(output, 'missing-media.png') });
  console.log('PASS: missing media produces an actionable error without a blank window');
  await instance.app.close();
  instance = null;

  assets.videos.opening_video.file = 'media/broken.webm';
  await writeFile(path.join(fixture, 'games/demo/media/broken.webm'), 'This is deliberately not a video.');
  await writeFile(assetsPath, JSON.stringify(assets));
  instance = await launch();
  await instance.page.getByRole('button', { name: '重新载入', exact: true }).waitFor();
  assert.equal(await instance.page.getByRole('button', { name: '重新观看', exact: true }).count(), 0);
  console.log('PASS: corrupt media is an error, never a normal story completion');
  assert.deepEqual(failures, []);
  console.log('All Electron smoke checks passed. Screenshots: test-results/');
} finally {
  if (instance) await instance.app.close();
}
