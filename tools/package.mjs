import { access, cp, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import electron from 'electron';
import { rcedit } from 'rcedit';
import { buildGame } from './build.mjs';
import {
  assertUniqueWorkIdentities, createStaging, parseArguments, publishStaging, readRegisteredWorks, readWork, releaseRoot,
  removeOutput, root, typecheck,
} from './workspace.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('当前便携打包脚本需要 Windows x64，使用本机已安装的 Electron 运行时。');
}
await access(electron);
const runtimeDirectory = path.dirname(electron);
const project = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const runtimeVersion = (await readFile(path.join(runtimeDirectory, 'version'), 'utf8')).trim();
const { game, flags } = parseArguments(process.argv.slice(2), ['--all']);
const registered = await readRegisteredWorks();
const works = flags.has('--all') ? registered : [registered.find((work) => work.id === game) ?? await readWork(game)];
if (works.length === 0) throw new Error('games 目录没有可打包的作品。');
assertUniqueWorkIdentities(registered, works.map((work) => work.id));
await typecheck();

for (const work of works) {
  const name = work.config.build.executableName;
  const destination = path.join(releaseRoot, `${name}-win32-x64`);
  const previous = await readFile(path.join(destination, 'portable-manifest.json'), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (previous && JSON.parse(previous).gameId !== work.id) {
    throw new Error(`发布目录 ${destination} 属于另一部作品，请更换 executableName。`);
  }
  const built = await buildGame(work.id, { checkTypes: false });
  const staging = await createStaging(releaseRoot, work.id);
  try {
    await cp(runtimeDirectory, staging, {
      recursive: true,
      filter: (source) => path.basename(source) !== 'default_app.asar',
    });
    const appDirectory = path.join(staging, 'resources', 'app');
    await cp(built.directory, appDirectory, { recursive: true });
    const executable = path.join(staging, `${name}.exe`);
    await rename(path.join(staging, 'electron.exe'), executable);
    await rcedit(executable, {
      icon: path.join(appDirectory, 'games', work.id, work.config.build.icon),
      'file-version': project.version,
      'product-version': project.version,
      'version-string': {
        ProductName: work.config.title,
        FileDescription: work.config.title,
        InternalName: name,
        OriginalFilename: `${name}.exe`,
        CompanyName: '',
        LegalCopyright: '',
      },
    });
    await writeFile(path.join(staging, 'portable-manifest.json'), `${JSON.stringify({
      gameId: work.id,
      title: work.config.title,
      appId: work.config.build.appId,
      version: project.version,
      electronVersion: runtimeVersion,
      executable: `${name}.exe`,
      platform: 'win32',
      architecture: 'x64',
    }, null, 2)}\n`);
    await writeFile(path.join(staging, 'README.txt'), [
      work.config.title,
      '',
      `双击 ${name}.exe 启动，无需安装 Node.js，也无需联网。`,
      '分发时请保留整个文件夹，不要只复制 exe 文件。',
      '本便携包未经代码签名。',
      'Electron / Chromium 的许可证位于 LICENSE 和 LICENSES.chromium.html。',
      'React 等应用依赖许可证位于 resources/app/THIRD_PARTY_LICENSES.txt。',
      '',
    ].join('\r\n'), 'utf8');
    await publishStaging(releaseRoot, staging, destination);
    console.log(`已生成 Windows 便携包：${destination}`);
  } catch (error) {
    await removeOutput(releaseRoot, staging);
    throw error;
  }
}
