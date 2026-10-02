# ADV 批量生产框架

面向 Windows PC 的离线 ADV 框架。每款作品复用运行内核，独立提供 UI、剧情和本地素材，并生成自己的发布包。

当前已完成第一阶段：Windows 桌面窗口、作品配置读取和本地视频播放。示例作品为“雾港”，附带一段 12 秒、约 1 MB 的原创无声演示视频。

设计与开发顺序以 [PC 框架设计基线](docs/adv-pc-framework-design.md) 为准。下一阶段是“视频 A → 选择 → 视频 B/C”的最小剧情闭环。

## 启动

需要 Windows 和 Node.js 22.12 或更高版本，建议使用 Node.js 24。首次安装依赖及获取 Electron 运行时需要网络，完成后本地播放不需要联网。

```powershell
npm ci
npm start
```

`npm start` 会先检查类型、构建，再启动桌面窗口。构建完成后，可以运行 `npm run start:built` 直接打开现有构建。

开发界面时使用 `npm run dev`。它启动本机开发服务和 Electron，修改 UI 可实时预览；修改桌面进程代码后需要重启该命令。正常运行使用 `npm start`，不需要开发服务。

当前提供的是可运行的开发工程，尚未制作独立安装包；按作品生成发布包安排在阶段 3。

## 已有功能

- 从 `games/demo/game.json` 读取作品信息与入口视频 ID。
- 从 `games/demo/assets.json` 解析本地视频，不把文件路径写入作品 UI。
- 开始播放、暂停、继续、从头播放、拖动进度、音量及全屏。
- `Space` 播放或暂停，`F` 切换全屏，`Esc` 退出全屏。按钮和输入框保留自身键盘操作。
- 配置错误、文件缺失和视频损坏时显示错误及重试入口。
- UI 更新时保留同一个视频元素与控制器。

本阶段不包含剧情分支、存档、立绘文字、QTE、调查和多端适配。

## 替换素材

将视频放入 `games/demo/media/`，然后修改 `games/demo/assets.json`：

```json
{
  "schemaVersion": 1,
  "videos": {
    "opening_video": {
      "file": "media/my-opening.mp4"
    }
  }
}
```

保留 `opening_video` 这个逻辑 ID，即可让同一套 UI 播放另一段视频。路径相对于 `games/demo/`，不能使用机器绝对路径或指向作品目录外的文件。修改素材或映射后重启作品；不需要修改播放代码。

支持配置 MP4 或 WebM 文件，实际能否播放取决于文件内的编码。示例 WebM 已经过 Electron 实测；自己的视频建议先用实际目标 PC 验证。示例本身无音轨，音量效果请用带声音的视频验证。

修改作品名称、说明与入口视频 ID：`games/demo/game.json`。当前只加载 `demo` 作品；多作品构建选择安排在阶段 3。

## 替换 UI

作品专属界面位于 `games/demo/ui/index.tsx`，样式位于同目录 `styles.css`。它接收作品信息、播放状态、操作接口及视频宿主引用，负责呈现而不读取本地文件。

修改布局时保留视频宿主的挂载，避免打开菜单或切换 UI 状态时重建播放器。公共按钮示例在 `src/ui-base/Button.tsx`，可以复用，也可以在作品中替换。

## 验证

```powershell
npm run check
npm run test:smoke
```

`check` 执行类型检查和 14 项行为测试，覆盖配置、路径边界、视频分段读取、播放失败和过期异步结果等。

`test:smoke` 构建并启动真实 Electron 窗口，检查离线播放、暂停、拖动、音量、结束、重播、全屏退出、窗口布局，以及换素材、缺失文件和损坏文件。异常素材只写入 `test-results/` 下的副本，不修改示例作品；截图也保存在该目录。该目录已被 Git 忽略。

## 演示素材

`games/demo/media/opening.webm` 由本项目的 `tools/generate-demo.py` 生成，没有使用外部影视片段。视频已随工程保存，正常启动不需要 Python、FFmpeg 或 OpenCV。

如需重新生成这段演示动画，可以在另外准备好 NumPy 和 OpenCV 的 Python 环境中运行该脚本；它不是项目启动的必要步骤。
