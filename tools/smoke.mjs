import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import electronPath from 'electron';
import { _electron as electron } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const selectedIndex = args.indexOf('--game');
const gameId = selectedIndex < 0 ? 'demo' : args[selectedIndex + 1];
assert.ok(gameId && /^[a-zA-Z0-9_-]+$/.test(gameId), 'Invalid --game');
const packaged = args.includes('--packaged');
if (!packaged && !args.includes('--built')) {
  const build = spawnSync(process.execPath, ['tools/build.mjs', '--game', gameId], { cwd: root, stdio: 'inherit' });
  assert.equal(build.status, 0, 'Build failed');
}
const output = path.join(root, 'test-results');
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(output, `smoke 中文 ${gameId} `));
const built = path.join(root, 'dist', gameId);
const game = JSON.parse(await readFile(path.join(built, 'games', gameId, 'game.json'), 'utf8'));
const story = JSON.parse(await readFile(path.join(built, 'games', gameId, 'story.json'), 'utf8'));
const nodes = new Map(story.nodes.map((node) => [node.id, node]));
const opening = nodes.get(game.entryNodeId);
const choice = nodes.get(opening.next);
assert.equal(choice.type, 'choice');
assert.equal(choice.options.length, 2);
const product = path.join(root, 'release', `${game.build.executableName}-win32-x64`);
if (!packaged) await cp(built, fixture, { recursive: true });
else assert.deepEqual(await readdir(path.join(product, 'resources/app/games')), [gameId]);
const env = { ...process.env, ADV_SMOKE_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ADV_DEV_SERVER_URL;
const failures = [];
const requests = [];
async function launch() {
  const app = await electron.launch({
    executablePath: packaged ? path.join(product, `${game.build.executableName}.exe`) : electronPath,
    args: packaged ? [] : [fixture], env, cwd: fixture, timeout: 45_000,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  return { app, page };
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
}
async function completeClip(page) {
  await ready(page);
  const duration = await page.locator('video').evaluate((video) => video.duration);
  if (await page.locator('video').evaluate((video) => video.paused)) {
    await page.getByRole('button', { name: '播放', exact: true }).click();
  }
  await page.getByRole('slider', { name: '播放进度' }).fill((duration - 0.8).toFixed(1));
}
async function layout(page, name) {
  // Native capture explicitly wakes a hidden Electron window, even at a held final frame.
  const png = await instance.app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    // The OS window stays hidden; making the page a capture target wakes its compositor.
    await window.capturePage(undefined, { stayAwake: true });
    const image = await window.capturePage(undefined, { stayAwake: true });
    return image.toPNG().toString('base64');
  });
  await writeFile(path.join(output, `${gameId}-${name}${packaged ? '-packaged' : ''}.png`), Buffer.from(png, 'base64'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: horizontal overflow`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true, `${name}: vertical overflow`);
}
let instance;
try {
  instance = await launch();
  const { app, page } = instance;
  await ready(page);
  assert.equal(await page.title(), game.title);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.adv.authoring), 'undefined', 'Players must not receive authoring IPC');
  assert.equal(await page.getByRole('button', { name: '流程编辑器', exact: true }).count(), 0);
  const rendererAssets = path.join(packaged ? path.join(product, 'resources/app') : built, 'dist/assets');
  for (const filename of await readdir(rendererAssets)) {
    if (!filename.endsWith('.js')) continue;
    const source = await readFile(path.join(rendererAssets, filename), 'utf8');
    assert.ok(!source.includes('adv-editor-layout:') && !source.includes('预览未保存草稿'), 'Production JS must exclude the flow editor');
  }
  const host = await app.evaluate(({ app, BrowserWindow }) => ({
    userData: app.getPath('userData'), packaged: app.isPackaged,
    preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  }));
  assert.equal(path.basename(host.userData), `${game.build.appId}.smoke`);
  assert.equal(host.preferences.contextIsolation, true);
  assert.equal(host.preferences.sandbox, true);
  assert.equal(host.preferences.nodeIntegration, false);
  if (packaged) assert.equal(host.packaged, true);
  await app.context().setOffline(true);
  await page.locator('video').evaluate((v) => { v.dataset.smokeIdentity = 'persistent'; });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog', { name: '播放设置' }).waitFor();
  await page.getByRole('slider', { name: '设置音量', exact: true }).fill('0.55');
  assert.ok(Math.abs(await page.locator('video').evaluate((v) => v.volume) - 0.55) < 0.01);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.locator('video').evaluate((v) => v.paused), true, 'Closing settings must not start an unplayed clip');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '设置');
  await page.getByRole('button', { name: '开始播放', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video').currentTime > 0.5);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog', { name: '播放设置' }).waitFor();
  assert.equal(await page.locator('video').evaluate((v) => v.paused), true);
  const modalTime = await page.locator('video').evaluate((v) => v.currentTime);
  await page.waitForTimeout(180);
  assert.ok(Math.abs(await page.locator('video').evaluate((v) => v.currentTime) - modalTime) < 0.05);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))), true);
  await layout(page, 'settings');
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.waitForFunction((time) => !document.querySelector('video').paused && document.querySelector('video').currentTime > time, modalTime);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  assert.equal(await page.locator('video').evaluate((v) => v.paused), true);
  const pausedTime = await page.locator('video').evaluate((v) => v.currentTime);
  await page.waitForTimeout(150);
  assert.ok(Math.abs(await page.locator('video').evaluate((v) => v.currentTime) - pausedTime) < 0.05);
  await page.locator('video').evaluate((v) => { v.dataset.smokeIdentity = 'persistent'; });
  await page.getByRole('slider', { name: '播放进度' }).fill('2');
  await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 2) < 0.2);
  await page.getByRole('slider', { name: '音量' }).fill('0.35');
  assert.ok(Math.abs(await page.locator('video').evaluate((v) => v.volume) - 0.35) < 0.01);
  await page.getByRole('button', { name: '从头播放', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('video').paused && document.querySelector('video').currentTime < 2);
  await layout(page, 'playing');
  await completeClip(page);
  await page.getByRole('button', { name: choice.options[0].label, exact: true }).waitFor();
  await layout(page, 'choice');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 680));
  await layout(page, 'compact-choice');
  assert.equal(await page.getByRole('slider', { name: '播放进度' }).count(), 0);
  // A rapid double click carries the same visit ID and must only choose once.
  await page.getByRole('button', { name: choice.options[0].label, exact: true }).evaluate((button) => { button.click(); button.click(); });
  const firstBranch = nodes.get(choice.options[0].next);
  await page.waitForFunction((mediaId) => document.querySelector('video').src.endsWith('/' + mediaId), firstBranch.mediaId);
  await ready(page);
  // Queued old DOM events cannot complete or pause the new source.
  await page.locator('video').evaluate((v) => { v.dispatchEvent(new Event('ended')); v.dispatchEvent(new Event('pause')); });
  assert.equal(await page.getByRole('button', { name: '重新开始', exact: true }).count(), 0);
  await layout(page, 'compact-playing');
  await completeClip(page);
  await page.getByRole('heading', { name: nodes.get(firstBranch.next).title, exact: true }).waitFor();
  await layout(page, 'ending');
  assert.equal(await page.locator('video').evaluate((v) => v.dataset.smokeIdentity), 'persistent');
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.waitForFunction((mediaId) => document.querySelector('video').src.endsWith('/' + mediaId), opening.mediaId);
  await completeClip(page);
  await page.getByRole('button', { name: choice.options[1].label, exact: true }).click();
  const secondBranch = nodes.get(choice.options[1].next);
  await page.waitForFunction((mediaId) => document.querySelector('video').src.endsWith('/' + mediaId), secondBranch.mediaId);
  await completeClip(page);
  await page.getByRole('heading', { name: nodes.get(secondBranch.next).title, exact: true }).waitFor();
  await page.getByRole('button', { name: '切换全屏', exact: true }).click();
  await page.waitForFunction(async () => await window.adv.getFullscreen());
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog', { name: '播放设置' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.adv.getFullscreen()), true, 'Escape closes a dialog before exiting fullscreen');
  await page.keyboard.press('Escape');
  await page.waitForFunction(async () => !(await window.adv.getFullscreen()));
  console.log(`PASS ${gameId}: ${packaged ? 'standalone EXE' : 'built app'}, offline playback, both branches/endings, independent settings screen, modal pause/resume and focus, persistent video, rapid clicks, stale events, fullscreen and minimum window`);
  await app.close(); instance = null;

  if (!packaged) {
    const contentRoot = path.join(fixture, 'games', gameId);
    const assetsPath = path.join(contentRoot, 'assets.json');
    const assets = JSON.parse(await readFile(assetsPath, 'utf8'));
    await cp(path.join(contentRoot, assets.videos[opening.mediaId].file), path.join(contentRoot, 'media/替换视频 sample.webm'));
    assets.videos[opening.mediaId].file = 'media/替换视频 sample.webm';
    await writeFile(assetsPath, JSON.stringify(assets));
    instance = await launch(); await ready(instance.page);
    await instance.app.close(); instance = null;
    assets.videos[opening.mediaId].file = 'media/not-present.webm';
    await writeFile(assetsPath, JSON.stringify(assets));
    instance = await launch();
    await instance.page.getByRole('alert').filter({ hasText: `素材 ${opening.mediaId} 无法读取` }).waitFor();
    await instance.app.close(); instance = null;
    assets.videos[opening.mediaId].file = 'media/替换视频 sample.webm';
    assets.videos[firstBranch.mediaId].file = 'media/broken.webm';
    await writeFile(path.join(contentRoot, 'media/broken.webm'), 'Deliberately not a video.');
    await writeFile(assetsPath, JSON.stringify(assets));
    instance = await launch(); await ready(instance.page);
    await completeClip(instance.page);
    await instance.page.getByRole('button', { name: choice.options[0].label, exact: true }).click();
    await instance.page.getByRole('button', { name: '重新载入', exact: true }).waitFor();
    assert.equal(await instance.page.getByRole('button', { name: '重新开始', exact: true }).count(), 0);
    await instance.page.getByRole('button', { name: '重新载入', exact: true }).click();
    await instance.page.getByRole('button', { name: '重新载入', exact: true }).waitFor();
    await instance.app.close(); instance = null;
    story.nodes.find((node) => node.id === firstBranch.id).next = 'missing_node';
    await writeFile(path.join(contentRoot, 'story.json'), JSON.stringify(story));
    instance = await launch();
    await instance.page.getByRole('alert').filter({ hasText: 'missing_node' }).waitFor();
    await instance.app.close(); instance = null;
    console.log(`PASS ${gameId}: manifest replacement with Unicode path, missing media, corrupt branch/retry, invalid story graph`);
  }
  assert.deepEqual(failures, []);
  assert.deepEqual(requests, []);
  console.log('All Electron smoke checks passed. Screenshots: test-results/');
} finally {
  if (instance) await instance.app.close();
}
