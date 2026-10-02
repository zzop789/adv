# 新建一部互动影游：从复制模板到 Windows 打包

本文对应当前已完成的阶段 1–3、UI 拆分及制作 API A–D。目标是创建一部名为“我的互动影游”的作品：使用自己的视频、分支剧情和 UI，最终生成 `MyGame.exe`。

框架使用 TypeScript、React 和 Electron。制作内容主要修改 JSON；修改界面使用 React 组件（`.tsx`）和 CSS。剧情可使用开发窗口的可视化编辑器，UI 布局仍使用 React/CSS。玩家拿到成品后可以离线运行，不需要服务器。

## 1. 先认识目录

下面是新作品完成复制后的结构。**一部作品一个 `games/<作品 ID>/` 目录**，平时主要在这里制作内容。

```text
try_adv/
├─ games/
│  ├─ demo/                     雾港：暗色影院模板
│  ├─ afterglow/                余光来信：明亮书信模板
│  └─ my-game/                 你将创建的作品
│     ├─ game.json             名称、简介、入口、程序名、图标
│     ├─ story.json            剧情节点、选项、跳转、结局
│     ├─ assets.json           视频逻辑 ID → 文件路径
│     ├─ media/                视频和程序图标
│     │  ├─ opening.webm
│     │  ├─ lighthouse.webm
│     │  ├─ shore.webm
│     │  └─ icon.ico
│     └─ ui/
│        ├─ index.tsx          注册各界面
│        ├─ Layout.tsx         整体布局、视频位置、控制栏
│        ├─ styles.css         配色、字体、间距、响应布局
│        ├─ assets/            可自行创建：UI 图片、字体
│        └─ screens/
│           ├─ PlaybackScreen.tsx  开始、暂停、加载、错误遮罩
│           ├─ ChoiceScreen.tsx    分支选择界面
│           └─ EndingScreen.tsx    结局界面
├─ src/                        所有作品共用的内核和控件
├─ tools/                      校验、构建、打包工具
├─ dist/                       构建产物，自动生成
└─ release/                    Windows 便携包，自动生成
```

`src/ui-base/` 是通用控件；`src/ui/` 管界面调用和剧情绑定。制作新作品通常不用修改这些共享代码。修改共享代码会影响所有作品。

## 2. 复制模板并启动新作品

以下命令在 **Windows PowerShell 的项目根目录**执行。开发需要 Node.js 22.12 或更高版本，本项目建议使用 Node.js 24。

```powershell
Set-Location 'C:\Users\ZYF\Documents\try_adv'
npm ci
```

`npm ci` 用于首次安装或依赖发生变化时；下载依赖和 Electron 时需要网络。已经安装好的工程不必每次重复执行。玩家的电脑不需要 Node.js。

复制暗色影院模板。已有同名目录时先停下，避免把两个作品混在一起：

```powershell
if (Test-Path -LiteralPath 'games/my-game') {
  throw 'games/my-game 已存在，请换一个作品 ID。'
}
Copy-Item -LiteralPath 'games/demo' -Destination 'games/my-game' -Recurse
```

本教程统一使用 `demo`。`afterglow` 可作为另一套布局参考，其剧情和素材 ID 与本例不同。

用编辑器打开 `games/my-game/game.json`，将全部内容替换为：

```json
{
  "schemaVersion": 2,
  "id": "my-game",
  "title": "我的互动影游",
  "subtitle": "第一章 · 初次相遇",
  "description": "你的选择，将决定故事的方向。",
  "entryNodeId": "opening",
  "build": {
    "executableName": "MyGame",
    "appId": "com.adv.mygame",
    "icon": "media/icon.ico"
  }
}
```

| 字段 | 怎么填写 |
| --- | --- |
| `id` | 与目录名完全相同；小写字母开头，只含小写字母、数字、连字符，例如 `my-game` |
| `title` / `subtitle` / `description` | 作品名、副标题、简介；`subtitle` 是作品副标题，不是视频字幕 |
| `entryNodeId` | `story.json` 中第一个要执行的节点 ID |
| `build.executableName` | 程序文件名，不带 `.exe`；如 `MyGame`，使用字母开头的英文字母、数字、下划线或连字符 |
| `build.appId` | 独立应用标识，如 `com.adv.mygame`；各段以小写字母开头，只用小写字母、数字，以点分隔 |
| `build.icon` | 相对作品目录的 ICO 文件路径；先沿用模板，之后替换 `media/icon.ico` |

新作品必须使用独立的 `executableName` 和 `appId`，不能与其他作品重复（仅改变大小写也不行）。程序名不能用 Windows 保留名称，例如 `CON`。三个 JSON 文件保留各自的 `schemaVersion`，用 UTF-8 保存，不写注释或多余的末尾逗号。

现在运行：

```powershell
npm start -- --game my-game
```

它会校验并构建，然后打开桌面窗口。此时名称已经改变，视频和剧情仍是模板内容。点击“开始播放”，等片段结束，选择一条路线并走到结局，就完成了第一次新建验证。

## 3. 视频放在哪里，怎样替换

**视频放在 `games/my-game/media/`。** 可以按章节创建子目录，例如 `media/chapter-01/opening.mp4`。

`games/my-game/assets.json` 是视频素材表。复制模板后，它的完整内容是：

```json
{
  "schemaVersion": 1,
  "videos": {
    "opening_video": { "file": "media/opening.webm" },
    "lighthouse_video": { "file": "media/lighthouse.webm" },
    "shore_video": { "file": "media/shore.webm" }
  }
}
```

例如你放入了 `games/my-game/media/chapter-01/opening.mp4`，就把其中一项改为：

```json
"opening_video": { "file": "media/chapter-01/opening.mp4" }
```

上面这一行是要替换的条目，不是完整 JSON 文件。保留另外两项，直到你也替换对应视频。

素材引用关系如下：

```text
story.json 的 mediaId: "opening_video"
          ↓
assets.json 的 videos.opening_video.file
          ↓
games/my-game/media/chapter-01/opening.mp4
```

`opening_video` 是素材的逻辑名字。保留这个 ID，只更换 `file`，剧情和播放代码都不用改。如果直接用新视频覆盖相同文件名，连 `assets.json` 都不用改。

制作时注意：

- 路径从作品目录开始，写 `media/...`；不能填 `C:\...`、网络网址、指向目录外的路径或符号链接。
- 素材配置接受 `.mp4` 和 `.webm`；文件内部编码仍须播放器支持。改扩展名不等于转码，正式片源应在目标 PC 上实际播放验证。
- 所有素材映射都会检查文件是否存在，包括当前剧情没有用到的映射。删除视频后，也应删除或更新失效映射。
- 打包会复制整个 `media/`，大体积原片和备份请放在作品发布素材目录之外。
- 示例视频没有声音。视频自带的可解码音频可以播放，目前没有独立 BGM、配音或外部字幕管理。

开发窗口中修改视频映射或 JSON 后，点击“重新载入预览（从头开始）”；成功后从入口重新预览，配置有误时保留原播放并提示错误。正在播放的视频优先换成新文件并修改映射，避免覆盖旧文件影响读取。交付前重新打包，平时编辑 `games/` 下的源文件。

## 4. 怎样编排分支剧情

打开 `games/my-game/story.json`。以下是可以直接使用的完整例子，引用上面三个已有素材 ID：

```json
{
  "schemaVersion": 1,
  "nodes": [
    {
      "id": "opening",
      "type": "video",
      "mediaId": "opening_video",
      "next": "direction"
    },
    {
      "id": "direction",
      "type": "choice",
      "prompt": "远处出现了一道灯光，你决定——",
      "options": [
        {
          "id": "follow_light",
          "label": "前往灯塔",
          "description": "寻找那道灯光的来源。",
          "next": "lighthouse"
        },
        {
          "id": "return_shore",
          "label": "返回岸边",
          "description": "回到熟悉的地方。",
          "next": "shore"
        }
      ]
    },
    {
      "id": "lighthouse",
      "type": "video",
      "mediaId": "lighthouse_video",
      "next": "light_ending"
    },
    {
      "id": "shore",
      "type": "video",
      "mediaId": "shore_video",
      "next": "home_ending"
    },
    {
      "id": "light_ending",
      "type": "end",
      "title": "结局一：新的旅途",
      "description": "你找到了灯塔，也找到了新的方向。"
    },
    {
      "id": "home_ending",
      "type": "end",
      "title": "结局二：归途",
      "description": "岸边的灯，仍然为你亮着。"
    }
  ]
}
```

这段配置表示：

```text
opening 开场视频 → direction 选择
                    ├─ follow_light → lighthouse 视频 → light_ending 结局
                    └─ return_shore → shore 视频      → home_ending 结局
```

三类 ID 的用途不同：节点 `id` 用于跳转；`mediaId` 在素材表里找视频；选项 `id` 标识玩家点了哪一个选项。推荐都用英文字母、数字和下划线，并保持含义清楚。

当前有三种节点：

| 节点 | 执行方式 |
| --- | --- |
| `video` | 播放 `mediaId`，成功到片尾后进入 `next` |
| `choice` | 显示 `prompt` 和 `options`，选择后进入该选项的 `next`；选项至少一个，数量不限于两个 |
| `end` | 展示 `title`、`description`，可以从入口重新开始 |

**选择在前一段视频播完后出现，背景保留末帧。** 若要在一部片子的第 30 秒让玩家选择，应先把视频剪成“选择前”和“选择后”的片段，再用节点连接；当前没有播放中途按时间弹出选择、限时选择或 QTE。

入口视频需要玩家点击开始，后续视频会自动播放。可以连接 `video → video`、多次选择或多条路线汇合，并不限于例子的一次二选一。多个节点也可以复用同一个视频素材。

添加节点时，确保 `next` 存在、节点 ID 唯一、同一选择内的选项 ID 唯一。所有节点都必须从入口可达，并且有通往某个结局的路径；孤立草稿节点和没有出口的循环都会校验失败。草稿先放在独立笔记中，接入路线后再加入 `nodes`。

需要通过代码批量修改剧情时，使用 `StoryEditor` 和本地保存 API；它支持暂时不完整的内存草稿、撤销重做，并在保存时检查整个流程。调用示例和命令行用法见 [制作 API 文档](authoring-api-design.md)。开发窗口也可点击“流程编辑器”编辑节点与分支；详见 [可视化编辑器教程](visual-editor-guide.md)。

## 5. UI 怎么修改

### 5.1 按修改目标找到文件

| 想改什么 | 修改位置 |
| --- | --- |
| 作品名、副标题、简介 | `game.json` |
| 选项文案、分支去向、结局文案 | `story.json` |
| 配色、字体、字号、按钮间距 | `ui/styles.css` |
| 视频区域、左右布局、页头、页脚、播放控制栏 | `ui/Layout.tsx` 和 `styles.css` |
| 开始、暂停、载入、出错时的遮罩 | `ui/screens/PlaybackScreen.tsx` |
| 选项排版、卡片、编号和装饰 | `ui/screens/ChoiceScreen.tsx` |
| 结局排版、重开按钮 | `ui/screens/EndingScreen.tsx` |
| 替换整个界面组件 | `ui/index.tsx` 中相应注册项 |

这里的路径都相对于 `games/my-game/`。更换文案和视频不要求修改 React；重新排列界面则需要修改 TSX/CSS。

复制作品后也检查写在组件里的固定文字。例如 `demo` 的 `Layout.tsx` 中有 `ADV / CINEMA` 品牌和页脚，`PlaybackScreen.tsx` 中有“序幕 · 即将开始”等引导语。这些不会跟着 `game.json` 自动改变。`afterglow` 还有信件介绍和落款，需要按作品调整。

### 5.2 先从配色和排版开始

开发界面时运行：

```powershell
npm run dev -- --game my-game
```

保存 TSX/CSS 后可实时预览 UI。此命令使用本机开发服务，不是玩家需要连接的线上服务器。一次运行一部作品，结束开发时在终端按 `Ctrl+C`。

如果复制的是 `demo`，可以在 `ui/styles.css` 原有 `.demo-shell` 中修改这些变量，例如改成偏蓝的主题：

```css
--demo-gold: #94c9ff;
--demo-muted: #a4b4c4;
--ui-accent: #94c9ff;
--ui-accent-text: #13283d;
--ui-focus: #94c9ff;
--ui-radius: 8px;
```

`--ui-*` 影响共享控件和设置弹窗；作品本身还有固定色值，完整换色也要调整对应 CSS。当前没有单独的 `theme.json`。

把两列选项改为上下排列，可以在 `styles.css` 末尾追加：

```css
.demo-choices {
  grid-template-columns: 1fr;
  gap: 12px;
}
```

复制目录后可以暂时保留 `.demo-*` 类名，构建只载入目标作品的 UI。调整字号、选项数量和布局后，检查全屏和最小 900×680 窗口，确保选项及控制按钮都能看到。

### 5.3 控件通用，界面可以单独替换

已有通用控件是 `Button`、`Slider`、`ChoiceList`、`Dialog`、`TimeLabel`，位于 `src/ui-base/`。各作品的 Screen 组合这些控件，只接收数据与回调。

例如，下面可以替换复制自 `demo` 的 `ui/screens/ChoiceScreen.tsx`，使用通用选项控件展示剧情数据：

```tsx
import { useEffect, useRef } from 'react';
import type { ChoiceScreenProps } from '../../../../src/ui/contracts';
import { ChoiceList } from '../../../../src/ui-base';
import '../styles.css';

export default function ChoiceScreen({ prompt, options, onChoose }: ChoiceScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [prompt, options]);

  return (
    <div className="demo-overlay demo-overlay--story">
      <section className="demo-story-panel">
        <h2 ref={headingRef} tabIndex={-1}>{prompt}</h2>
        <ChoiceList
          items={options}
          onChoose={onChoose}
          ariaLabel={prompt}
          className="demo-choices"
        />
      </section>
    </div>
  );
}
```

界面把选项 ID 传给 `onChoose` 即可；跳转目标仍由 `story.json` 决定。不要在选项按钮中写视频文件路径或自行修改剧情位置。

`ui/index.tsx` 注册布局和界面。更换某块界面时导入新组件，再替换相应属性：

```tsx
export default {
  Layout,
  screens: {
    playback: PlaybackScreen,
    choice: ChoiceScreen,
    ending: EndingScreen,
  },
} satisfies WorkUI;
```

上面是注册部分，沿用文件原有的组件和 `WorkUI` 导入。设置弹窗默认复用共享实现；需要独立外观时，新建自己的 `SettingsScreen.tsx`，实现 `SettingsScreenProps`，然后额外注册 `settings: MySettingsScreen`。

各 Screen 也可以作为普通 React 组件单独使用。代码可以通过 UIManager 的 `open`、`show`、`close` 调用已注册界面；完整参数、独立使用示例和新增界面步骤见 [UI 架构与调用示例](ui-architecture.md)。

### 5.4 改布局时保留四个连接点

`Layout.tsx` 中必须保留一个持续挂载的视频容器，以及三个界面插槽：

```tsx
<div ref={videoHostRef} className="demo-video-host" />
{slots.playback}
{slots.story}
{slots.modal}
```

这四行表示要保留的连接点，并不是要求把它们放在一起。`playback` 放播放遮罩，`story` 放选择和结局，`modal` 放设置等弹窗；可以在布局中安排不同位置。保留设置按钮的 `openSettings` 回调。

视频容器只出现一次，不要按当前节点切换它的 `key`，也不要在切换选择/结局时卸载它。播放器由共享内核管理，Screen 不需要另建 `<video>`。这样切换 UI、开关设置时才能保持同一个播放实例。

### 5.5 UI 图片和视频分开放

界面图片可放在 `games/my-game/ui/assets/`，例如 `logo.png`。在 `Layout.tsx` 中静态导入：

```tsx
import logo from './assets/logo.png';
// 在组件返回的 JSX 中使用：
<img src={logo} alt={game.title} />
```

CSS 背景可以用 `url('./assets/background.png')`，本地字体也可在 CSS 的 `@font-face` 中引用。构建工具会处理被引用的资源，图片文件放进去后还需要在代码或 CSS 中引用。

当前 `assets.json` 的 `videos` 及 `adv-media` 协议专门用于视频，不能当作通用图片加载器。UI 图片使用上述导入方式，打包后仍可离线显示。

## 6. 校验、预览和交付

| 操作 | 命令 | 用途 |
| --- | --- | --- |
| 检查剧情和素材 | `node --import tsx tools/validate-content.ts --game my-game` | 不开窗口，检查配置、图标、文件与剧情图 |
| 检查 TypeScript | `npm run typecheck` | 检查 UI 和共享代码；会检查工程内所有作品源码 |
| 开发 UI | `npm run dev -- --game my-game` | 本机开发服务与 UI 热更新 |
| 构建并运行 | `npm start -- --game my-game` | 读取新配置和素材，运行本地构建 |
| 仅打开已有构建 | `npm run start:built -- --game my-game` | 不重新构建，仍使用上一次产物 |
| 只构建 | `npm run build -- --game my-game` | 生成 `dist/my-game/`，还没有独立 EXE |
| 生成 Windows 包 | `npm run package -- --game my-game` | 校验、重新构建并生成完整便携目录 |
| 打包全部作品 | `npm run package:all` | 为 `games/` 下每部作品分别打包，包括演示作品 |

不写 `--game` 时默认操作 `demo`。开发时，剧情与素材修改可选择动态更新策略后“应用文件更新”，也可从编辑器预览未保存草稿；桌面进程代码、作品 ID 或构建身份修改后仍需重启命令。`npm start` 读取最新源文件构建；不要用 `start:built` 检查尚未构建的修改。

打包命令成功后，产物为：

```text
release/MyGame-win32-x64/
├─ MyGame.exe
├─ resources/
└─ 其他 Electron 运行文件……
```

将 **整个 `MyGame-win32-x64` 文件夹**压缩交付，玩家解压后双击 `MyGame.exe`。只发送 EXE 无法正常运行。当前输出为 Windows x64 便携包，尚未制作安装向导和代码签名。构建失败会保留旧的成功产物，务必以命令成功结果确认这次打包完成。

每次交付前至少验证一次：从开头走完每条路线、到达各个结局、重新开始、拖动进度、暂停续播、设置开关、音量和全屏，并检查自己的视频音画表现。最后使用发布目录中的 EXE 再走一遍主要流程。

框架源码改动可运行 `npm run check`。现有 `test:smoke` 针对演示作品的“一次二选一、两个结局”结构；改成多章或多次选择后，需要调整该检查脚本，不能直接把它当作任意剧情的通用验收工具。

## 7. 当前都有哪些功能

| 模块 | 已实现 |
| --- | --- |
| 离线运行 | 本地视频、无需业务服务器、独立 Windows x64 便携包 |
| 剧情 | 视频节点、分支选择、路线汇合、多个结局、从入口重新开始 |
| 播放 | 开始、暂停、继续、当前片段从头播放、进度拖动、音量、全屏 |
| 快捷键 | `Space` 播放/暂停、`F` 全屏；`Esc` 先关闭弹窗，再退出全屏；按钮和输入框保留自身键盘行为 |
| UI | 通用控件、独立 Screen、作品专属布局与皮肤、按名称打开/更新/关闭界面 |
| 设置示例 | 音量、全屏；打开弹窗暂停视频，关闭后按原播放状态恢复 |
| 生产流程 | 每作品独立配置、图标和程序名；按作品构建、打包全部作品 |
| 制作 API | 可视化节点图、节点字段与连线、撤销重做、校验、版本冲突检查、安全保存与草稿预览 |
| 动态更新 | 从头开始、重播指定/当前节点、保留兼容视频进度，失败保留旧状态 |
| 动效 | 淡入淡出、上移入场、统一句柄与取消、媒体时间触发、节点动效配置 |
| 校验与容错 | 检查缺失文件、错误跳转、重复 ID、不可达节点和无出口循环；播放错误提示与重试；防重复选择和旧回调推进剧情 |

**尚未实现，需要继续开发的功能：**

- 标题菜单、章节选择、存档读档、自动保存、观看历史和玩家可查看的解锁流程图。
- 设置持久化；当前音量等设置在本次运行中使用，重启后不保留。
- 条件变量、好感度、按条件出现的选项、QTE、倒计时选择、热点调查。
- 传统 ADV 的立绘与文字演出、独立 BGM/配音管理、外部字幕与音轨选择。
- 多轨时间轴、视频剪辑、双视频交叉溶解、UI 布局可视化制作。
- Steam 接入，以及移动端、浏览器等其他端的发布。

当前可以做以“看片段 → 作出选择 → 进入后续片段”为主的互动网剧。长篇制作前应先补节点存档，避免玩家退出后只能从头开始。

## 8. 常见问题

| 问题 | 先检查 |
| --- | --- |
| 新作品打不开 | 目录名与 `game.id` 是否一致；命令是否带 `--game my-game` |
| 提示程序名或 appId 冲突 | 复制模板后是否修改了 `build.executableName`、`build.appId` |
| 视频不存在 | `assets.json` 路径相对于作品目录，真实文件是否在 `media/` 内；有无失效旧映射 |
| 文件存在却不能播放 | 先用该文件在实际 Electron 程序中验证编码和文件完整性，不能只看扩展名 |
| 开头看完才出现选项 | 当前就是片尾触发；需要更早选择时先剪开视频 |
| 提示不可达节点或无法到达结局 | 检查入口、`next` 和孤立草稿；每条可进入的路线都应有通往结局的路径 |
| 改了文件却没变化 | 是否改错作品目录；开发窗口是否点击重新载入预览；运行或发布前是否重新构建 |
| 改了作品名仍看到模板品牌 | 检查 `Layout.tsx` 和各 Screen 中的固定文字 |
| 图片开发时能看到，打包后丢失 | 用静态 `import` 或 CSS `url()` 引用，不使用电脑绝对路径 |
| 退出后进度丢失 | 当前尚无存档，属于待开发功能 |

架构边界和后续开发顺序见 [PC 框架设计基线](adv-pc-framework-design.md)，界面调用与扩展见 [UI 架构与调用示例](ui-architecture.md)。
