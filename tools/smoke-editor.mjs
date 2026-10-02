import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import electronPath from 'electron';
import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { buildDesktop } from './build-desktop.mjs';
import { writeAppManifest } from './build.mjs';
import { readWork, root } from './workspace.mjs';

const output = path.join(root, 'test-results');
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(output, 'editor 中文 '));
const directory = path.join(fixture, 'game'), application = path.join(fixture, 'app');
await cp(path.join(root, 'games/demo'), directory, { recursive: true });
const base = await readWork('demo'), config = structuredClone(base.config);
config.build.appId = 'com.adv.editorsmoke';
await writeFile(path.join(directory, 'game.json'), JSON.stringify(config));
const work = { ...base, directory, config };
const storyPath = path.join(directory, 'story.json');
const disk = JSON.parse(await readFile(storyPath, 'utf8'));
const choice = disk.nodes.find((node) => node.type === 'choice');
const ending = disk.nodes.find((node) => node.type === 'end');
const oldGame = process.env.ADV_GAME_ID; process.env.ADV_GAME_ID = 'demo';
let app, server, page;
try {
  await mkdir(application, { recursive: true });
  await buildDesktop(work, application, { development: true });
  await writeAppManifest(work, application);
  server = await createServer({ root, configFile: path.join(root, 'vite.config.ts') }); await server.listen();
  const env = { ...process.env, ADV_SMOKE_TEST: '1', ADV_DEV_SERVER_URL: 'http://127.0.0.1:5173' }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: electronPath, args: [application], cwd: root, env, timeout: 45000 });
  page = await app.firstWindow(); page.setDefaultTimeout(20000);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  const failures = []; page.on('pageerror', (error) => failures.push(error.message));
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.evaluate(() => localStorage.removeItem('adv-editor-layout:demo'));
  await page.locator('video').evaluate((v) => { v.dataset.editorIdentity = 'persistent'; });
  await page.getByRole('button', { name: '流程编辑器', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /流程编辑器/ });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: `选择节点 ${choice.id}`, exact: true }).click();
  await dialog.getByRole('textbox', { name: '选择提示', exact: true }).fill('可视编辑器的未保存草稿');
  await dialog.getByRole('button', { name: '添加选项', exact: true }).click();
  await dialog.getByRole('textbox', { name: '选项 3 文案', exact: true }).fill('第三条路');
  await dialog.getByRole('combobox', { name: '选项 3 目标', exact: true }).selectOption(ending.id);
  await dialog.getByRole('combobox', { name: '入场动效', exact: true }).selectOption('fade');
  await dialog.getByRole('spinbutton', { name: '动效时长（毫秒）', exact: true }).fill('2000');
  await dialog.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal(await dialog.getByRole('spinbutton', { name: '动效时长（毫秒）', exact: true }).inputValue(), '500');
  await dialog.getByRole('button', { name: '重做', exact: true }).click();
  assert.equal(await dialog.getByRole('spinbutton', { name: '动效时长（毫秒）', exact: true }).inputValue(), '2000');
  await dialog.getByRole('button', { name: '校验剧情', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: '校验通过' }).waitFor();
  await writeFile(path.join(fixture, 'ignored-build-output.html'), '<p>build output</p>');
  await page.waitForTimeout(200);
  assert.equal(await dialog.getByRole('textbox', { name: '选择提示', exact: true }).inputValue(), '可视编辑器的未保存草稿');
  assert.ok(await dialog.locator('svg g path').count() >= 5);
  await dialog.locator('.editor-inspector').evaluate((inspector) => { inspector.scrollTop = 0; });
  await page.waitForTimeout(100);
  const shot = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    await window.capturePage(undefined, { stayHidden: true, stayAwake: true });
    const image = await window.capturePage(undefined, { stayHidden: true, stayAwake: true });
    return image.toPNG().toString('base64');
  });
  await writeFile(path.join(output, 'editor.png'), Buffer.from(shot, 'base64'));
  await dialog.getByRole('button', { name: '从此节点预览', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: '可视编辑器的未保存草稿', exact: true }).waitFor();
  await page.getByRole('button', { name: '第三条路', exact: true }).waitFor();
  assert.ok(await page.locator('.adv-story-effect-host').evaluate((host) => host.getAnimations({ subtree: true }).length) > 0,
    'The newly mounted choice screen has its configured entrance animation');
  assert.deepEqual(JSON.parse(await readFile(storyPath, 'utf8')), disk, 'Draft preview never saves implicitly');
  assert.equal(await page.locator('video').evaluate((v) => v.dataset.editorIdentity), 'persistent');
  await page.getByRole('button', { name: '流程编辑器', exact: true }).click();
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('textbox', { name: '选择提示', exact: true }).inputValue(), '可视编辑器的未保存草稿');
  await dialog.getByRole('button', { name: '保存剧情', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: '剧情已保存' }).waitFor();
  console.log('PASS graph, options/effects, draft preview and save');
  const saved = JSON.parse(await readFile(storyPath, 'utf8'));
  assert.equal(saved.nodes.find((n) => n.id === choice.id).options.length, 3);
  saved.nodes.find((n) => n.id === choice.id).prompt = '来自外部编辑器的修改';
  await writeFile(storyPath, JSON.stringify(saved));
  await dialog.getByRole('textbox', { name: '选择提示', exact: true }).fill('不能覆盖外部版本');
  await dialog.getByRole('button', { name: '保存剧情', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'revision 冲突' }).waitFor();
  assert.equal(JSON.parse(await readFile(storyPath, 'utf8')).nodes.find((n) => n.id === choice.id).prompt, '来自外部编辑器的修改');
  await dialog.getByRole('button', { name: '重新读取', exact: true }).click();
  await dialog.getByRole('alertdialog', { name: '未保存修改' }).waitFor();
  await dialog.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.equal(await dialog.getByRole('textbox', { name: '选择提示', exact: true }).inputValue(), '不能覆盖外部版本');
  await dialog.getByRole('button', { name: '重新读取', exact: true }).click();
  await dialog.getByRole('button', { name: '放弃修改并重新读取', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: '已读取磁盘剧情' }).waitFor();
  await dialog.getByRole('button', { name: `选择节点 ${config.entryNodeId}`, exact: true }).click();
  assert.equal(await dialog.getByRole('button', { name: '删除节点', exact: true }).isDisabled(), true);
  for (const kind of ['视频', '选择', '结局']) {
    await dialog.getByRole('button', { name: `＋ ${kind}`, exact: true }).click();
    await dialog.getByRole('button', { name: '删除节点', exact: true }).click();
    await dialog.getByRole('button', { name: '撤销', exact: true }).click();
    await dialog.getByRole('button', { name: '撤销', exact: true }).click();
  }
  const card = dialog.getByRole('button', { name: `选择节点 ${choice.id}`, exact: true });
  const before = await card.boundingBox();
  await page.mouse.move(before.x + 35, before.y + 30); await page.mouse.down();
  await page.mouse.move(before.x + 85, before.y + 70, { steps: 4 }); await page.mouse.up();
  assert.ok((await card.boundingBox()).x > before.x + 40);
  await dialog.getByRole('button', { name: '缩小画布', exact: true }).click();
  await dialog.getByText('90%', { exact: true }).waitFor();
  await dialog.getByRole('textbox', { name: '选择提示', exact: true }).fill('关闭时需确认');
  await dialog.getByRole('button', { name: '关闭编辑器', exact: true }).click();
  await dialog.getByRole('alertdialog', { name: '未保存修改' }).waitFor();
  await dialog.getByRole('button', { name: '放弃修改并关闭', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  console.log('PASS revision conflict, dirty guards, entry protection, node CRUD and layout');

  await page.getByRole('button', { name: '重新载入预览（从头开始）', exact: true }).click();
  await page.getByRole('button', { name: '开始播放', exact: true }).waitFor();
  await page.getByRole('button', { name: '开始播放', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('video').paused);
  await page.getByRole('button', { name: '流程编辑器', exact: true }).click();
  await dialog.waitFor();
  await page.waitForFunction(() => document.querySelector('video').paused);
  const paused = await page.locator('video').evaluate((video) => ({ src: video.currentSrc, time: video.currentTime }));
  await dialog.getByRole('button', { name: `选择节点 ${choice.id}`, exact: true }).click();
  await dialog.getByRole('textbox', { name: '选择提示', exact: true }).fill('保留进度时恢复临时暂停');
  await dialog.getByRole('combobox', { name: '草稿预览策略', exact: true }).selectOption('preserve');
  await dialog.getByRole('button', { name: '预览未保存草稿', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(({ src, time }) => {
    const video = document.querySelector('video');
    return !video.paused && video.currentSrc === src && video.currentTime > time + .15;
  }, paused);
  assert.equal(await page.locator('video').evaluate((video) => video.dataset.editorIdentity), 'persistent');
  console.log('PASS preserve preview resumes the same physical video');
  await page.getByRole('button', { name: '流程编辑器', exact: true }).click();
  await dialog.getByRole('button', { name: '关闭编辑器', exact: true }).click();
  await dialog.getByRole('button', { name: '放弃修改并关闭', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });

  for (const entry of [choice, ending]) {
    const current = JSON.parse(await readFile(storyPath, 'utf8'));
    current.nodes.find((node) => node.id === entry.id).effect = { preset: 'fade', durationMs: 8000 };
    const reachable = new Set();
    const visit = (id) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      const node = current.nodes.find((item) => item.id === id);
      if (node.type === 'video') visit(node.next);
      if (node.type === 'choice') node.options.forEach((option) => visit(option.next));
    };
    visit(entry.id);
    current.nodes = current.nodes.filter((node) => reachable.has(node.id));
    await writeFile(storyPath, JSON.stringify(current));
    await writeFile(path.join(directory, 'game.json'), JSON.stringify({ ...config, entryNodeId: entry.id }));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.adv-story-effect-host')?.firstElementChild, null,
      { polling: 50, timeout: 20000 });
    assert.ok(await page.locator('.adv-story-effect-host').evaluate((host) => host.getAnimations({ subtree: true }).length) > 0,
      `Initial ${entry.type} entry starts its effect after the screen mounts`);
  }
  assert.deepEqual(failures, []);
  console.log('PASS editor: graph/connectors, node kinds/options/effects, undo/redo, draft preview, preserve resumes same video, initial choice/end effects, save/conflict, dirty guards, entry protection, drag/zoom.');
} catch (error) {
  console.error('Editor smoke failure UI:', await page?.locator('body').innerText({ timeout: 2000 }).catch(() => 'unavailable'));
  throw error;
} finally {
  if (app) {
    // A dirty-draft beforeunload guard must not keep a failed hidden smoke alive.
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    }).catch(() => {});
    await app.close();
  }
  if (server) await server.close();
  if (oldGame === undefined) delete process.env.ADV_GAME_ID; else process.env.ADV_GAME_ID = oldGame;
}
