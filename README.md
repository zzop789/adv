# ADV 批量生产框架

面向 Windows PC 的离线 ADV 框架。每款作品复用运行内核，独立提供 UI、剧情和本地素材，并生成自己的发布包。

当前已完成阶段 1–3：桌面播放器、视频分支剧情闭环、两套独立 UI 与素材，以及按作品生成 Windows x64 便携包。

设计与开发顺序以 [PC 框架设计基线](docs/adv-pc-framework-design.md) 为准。阶段 3 首次交付的审查与验证记录见 [阶段 3 Review](docs/review-stage-3.md)。下一阶段是标题菜单、设置持久化和节点检查点存档。

UI 已拆分为通用控件、独立界面、作品布局和代码调用管理器，详见 [UI 架构与调用示例](docs/ui-architecture.md)。现有设置弹窗复用音量与全屏功能，尚未加入设置持久化。

| 作品 ID | 作品 | 独立界面 | 便携程序 |
| --- | --- | --- | --- |
| `demo` | 雾港 | 暗色影院、画面内双选项 | `release/FogHarbor-win32-x64/FogHarbor.exe` |
| `afterglow` | 余光来信 | 明亮书信、左右双栏布局 | `release/AfterglowLetter-win32-x64/AfterglowLetter.exe` |

每部作品都有三段不同的原创视频、两个结局和独立图标，共用同一剧情内核。演示片段均为 6 秒无声动画，用于验证框架；后续可直接替换成实拍内容。

## 启动

需要 Windows 和 Node.js 22.12 或更高版本，建议使用 Node.js 24。首次安装依赖及获取 Electron 运行时需要网络，完成后本地播放不需要联网。

```powershell
npm ci
npm start
npm start -- --game afterglow
```

所有作品命令默认选择 `demo`，使用 `--game <作品 ID>` 切换。`npm start` 会校验类型、剧情和素材并构建，再启动桌面窗口。构建完成后，可以运行 `npm run start:built -- --game afterglow` 直接打开现有构建。

开发界面时使用 `npm run dev -- --game afterglow`。它启动本机开发服务和 Electron，修改 UI 可实时预览；修改剧情、素材或桌面进程代码后重启该命令。正常运行不需要开发服务。

## 独立打包

```powershell
npm run build -- --game demo
npm run package -- --game demo
npm run package:all
```

`build` 输出到 `dist/<作品 ID>/`；`package` 校验并重新构建指定作品，再生成 `release/<程序名>-win32-x64/`。`package:all` 为 `games/` 中的每部作品分别生成便携包。

将完整便携文件夹交给玩家，双击其中的 EXE 即可离线运行，无需 Node.js、Python 或开发工程。不要只复制 EXE。当前为未签名的便携包，尚未制作安装向导；`release/` 和 `dist/` 不提交 Git。

打包时仅带入目标作品编译后的 UI、剧情、素材及运行时，保留第三方许可证。每部作品的名称、EXE 图标和本地应用数据目录独立；存档功能仍属于阶段 4。构建失败会保留上一次成功产物。

## 已有功能

- 从 `games/<ID>/game.json` 读取作品信息、入口节点和构建信息。
- 从 `story.json` 执行 `video → choice → video → end`，支持不同结局与重新开始。
- 从 `games/demo/assets.json` 解析本地视频，不把文件路径写入作品 UI。
- 开始播放、暂停、继续、从头播放、拖动进度、音量及全屏。
- `Space` 播放或暂停，`F` 切换全屏，`Esc` 退出全屏。按钮和输入框保留自身键盘操作。
- 配置错误、文件缺失和视频损坏时显示错误及重试入口。
- UI 更新时保留同一个视频元素与控制器。
- 重复选择和旧播放回调不能推动新剧情；错误不会被当成正常完成。
- 构建前校验重复 ID、跳转目标、素材存在性、不可达节点及无法到达结局的循环。

本阶段不包含存档、条件变量、立绘文字、QTE、调查和多端适配。

## 替换素材

将视频放入 `games/demo/media/`，然后修改 `games/demo/assets.json` 中对应映射，例如只替换以下一项，保留其他剧情引用的素材：

```json
"opening_video": { "file": "media/my-opening.mp4" }
```

保留 `opening_video` 这个逻辑 ID，即可让同一剧情节点播放另一段视频。路径相对于作品目录，视频和图标必须放在 `media/` 内，不能使用绝对路径或符号链接。修改源素材或映射后重新构建、打包；不需要修改播放代码。

支持配置 MP4 或 WebM 文件，实际能否播放取决于文件内的编码。示例 WebM 已经过 Electron 实测；自己的视频建议先用实际目标 PC 验证。示例本身无音轨，音量效果请用带声音的视频验证。

## 剧情与新作品

`game.json` 使用版本 2，`story.json` 和 `assets.json` 使用版本 1。旧版 `entryMediaId` 已替换为 `entryNodeId`。配置示例：

```json
{
  "schemaVersion": 2,
  "id": "demo",
  "title": "雾港",
  "subtitle": "第一章 · 灯塔之外",
  "description": "雾里传来一道灯光。",
  "entryNodeId": "opening",
  "build": {
    "executableName": "FogHarbor",
    "appId": "com.adv.fogharbor",
    "icon": "media/icon.ico"
  }
}
```

`story.json` 的 `nodes` 包含三类节点：

| 类型 | 必需字段 | 行为 |
| --- | --- | --- |
| `video` | `id`, `mediaId`, `next` | 成功播完后进入 `next` |
| `choice` | `id`, `prompt`, `options` | 选项包含 `id`, `label`, `next`，可附 `description` |
| `end` | `id`, `title`, `description` | 展示结局，允许重新开始 |

完整例子见两部作品的 `story.json`。玩家可拖动视频进度，播放到末尾后才推进；不会因为拖动或重播重复执行选项。当前不限制已看/未看片段的快进。

创建新作品时复制 `games/demo/` 或 `games/afterglow/`，更改目录名、`game.id`、`build.executableName` 与 `build.appId` 为独立值，再替换 UI、剧情与素材。目录名使用小写字母、数字、连字符并以字母开头。然后执行 `npm run package -- --game 新ID`。

## 替换 UI

`games/<ID>/ui/index.tsx` 默认导出 `{ Layout, screens }` 注册表。构建时 `@work-ui` 只选择目标作品。原先一个大组件已拆为 `Layout.tsx` 和 `screens/PlaybackScreen.tsx`、`ChoiceScreen.tsx`、`EndingScreen.tsx`；设置默认使用共享 SettingsScreen，也允许作品替换。

界面只接收数据与 `onChoose`、`onRestart` 等回调，可以直接作为 React 组件单独使用，也可通过 `ui.open(name, props)`、`ui.show(name, props)`、`ui.close(name)` 调用。剧情访问代次与播放规则由 `src/ui/player-ui.ts` 绑定，界面不自行写剧情节点或分支目标。

修改 Layout 时保留视频宿主与播放、剧情、弹窗三个插槽。公共控件统一从 `src/ui-base` 导入：Button、Slider、ChoiceList、Dialog、TimeLabel。主题通过 `--ui-*` CSS 变量和作品类名定制。打开设置会暂停当前播放，关闭后按原状态恢复，视频元素不重建。

## 验证

```powershell
npm run check
npm run test:smoke -- --game demo
npm run test:smoke -- --game afterglow
npm run package:all
npm run test:smoke -- --game demo --packaged
npm run test:smoke -- --game afterglow --packaged
```

`check` 执行类型检查和行为测试，覆盖剧情分支、播放代次、过期异步结果、配置、路径边界、构建输出恢复，以及通用控件、界面实例和弹窗协调。

`test:smoke` 构建并启动真实 Electron，检查离线播放、两条分支、两个结局、重播/重开、重复点击、过期事件、设置弹窗、焦点、暂停恢复、全屏和最小窗口；异常素材只写入 `test-results/` 副本。`--built` 使用现有构建；`--packaged` 直接启动已经生成的作品 EXE。截图位于已被 Git 忽略的 `test-results/`。

## 演示素材

两部作品的动画和图标均由 `tools/generate-demo.py` 生成，没有使用外部影视片段。素材已随工程保存，正常启动不需要 Python、FFmpeg 或 OpenCV。

如需重新生成素材，可以在另外准备好 NumPy、OpenCV 和 Pillow 的 Python 环境中运行该脚本；它不是项目启动的必要步骤。
