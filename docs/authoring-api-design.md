# 流程编辑 内容修改与动效 API

确定日期：2026-10-02。本文补充 PC 框架设计基线，固定本地制作 API 的职责、更新规则和开发顺序。目标是让作品代码与未来编辑器调用同一套接口，减少制作新作品时对共享内核的修改。

当前状态：A–D 已实现：代码制作接口、动态应用、统一动效和本地可视化编辑器。按功能目录拆分，旧导入入口保留简短兼容导出。

## 决定与实现顺序

在原阶段 3 与阶段 4 之间增加“制作 API”阶段，先完成以下闭环：

```text
创建剧情草稿 → 编辑节点与连线 → 校验 → 保存 story.json
                                           ↓
                               开发窗口显式重新载入
                                           ↓
                         同一会话按策略应用内容并预览
```

所有能力在本机运行，不增加服务器、账号或在线内容分发。TypeScript、命令行和可视化编辑器复用校验与存储能力；制作工具不会进入玩家发布包。

| 顺序 | 内容 | 本次范围 |
| --- | --- | --- |
| A 流程编辑与重载预览 | 节点编辑、连线、撤销重做、校验、安全保存、显式重载 | 已实现并验证 |
| B 运行中应用内容 | 内容版本、应用策略、当前节点被修改或删除时的处理 | 已实现 |
| C 动效控制 | 淡入淡出、上移入场、取消与完成、媒体时间触发 | 已实现 |
| D 可视化制作工具 | 节点图、字段编辑、撤销重做、保存与草稿预览 | 已实现 |

原阶段 4 的标题菜单、设置持久化和节点存档仍需开发，制作 API 不代表这些成品能力已经完成。

## 模块边界

| 模块 | 职责 |
| --- | --- |
| `src/authoring/story/` | 纯 TypeScript 的剧情草稿、编辑历史和图校验，不依赖 Electron、React 或文件系统 |
| `src/authoring/storage/` | Node.js 制作接口，读取版本、验证候选剧情并保存到本地作品 |
| `tools/story.mts` | 命令行校验或保存候选剧情，复用制作存储 API |
| `src/desktop/content/` | 复用现有完整内容校验；候选剧情可以在内存中验证，不先覆盖正式文件 |
| `src/desktop/content/registry.ts` | 为每次内容加载生成独立标识和素材映射，旧会话释放前保持旧映射 |
| `src/renderer/` | 开发态制作入口、候选应用、素材版本持有和动效挂载 |
| `src/runtime/` | 继续执行已验证的剧情快照，编辑器不能直接修改运行中的节点对象 |

浏览器可使用的草稿 API 与 Node.js 文件写入 API 分开导入。文件写入只通过开发态 preload 的 authoring 桥接开放，主进程同时检查开发态与调用来源；发布包没有这个对象和 IPC。

## A 流程编辑与重载预览

### 草稿接口

`StoryEditor` 使用当前三类节点：`video`、`choice`、`end`。编辑已有节点时传入完整的新节点，节点 ID 不变。重命名节点及自动重接所有引用暂不提供。

| 方法 | 语义 |
| --- | --- |
| `new StoryEditor(story, entryNodeId)` | 创建与输入对象隔离的草稿 |
| `getSnapshot()` / `subscribe(listener)` | 读取不可变快照、订阅变更；快照含剧情、入口、版本和撤销状态 |
| `addNode(node)` | 添加形状合法且 ID 不重复的节点 |
| `updateNode(node)` | 完整替换同 ID 节点，包括文字、选项、素材 ID 和跳转 |
| `removeNode(id)` | 删除节点，保留其他节点中的引用供作者修复 |
| `connect(fromId, targetId, optionId?)` | 修改视频的 `next`，或指定选择项的 `next` |
| `setEntry(nodeId)` | 修改草稿校验使用的入口 |
| `undo()` / `redo()` | 撤销或重做编辑；新的编辑清空重做历史 |
| `validate(mediaIds)` | 完整校验可运行性，返回成功或错误说明 |
| `export()` | 导出独立的 `{ story, entryNodeId }` 副本 |

草稿允许暂时断链、空节点列表或不可达节点，便于逐步搭建流程；每个节点的字段形状和 ID 唯一性仍须正确。保存或预览必须通过完整校验，包括入口、目标、素材、可达性和通往结局的路径。

每次实际编辑、撤销或重做都会递增草稿 `revision`。这是内存编辑序号，与磁盘文件的版本哈希不同。失败的编辑不写入历史，也不部分修改草稿。

### 本地校验与保存

| 方法 | 语义 |
| --- | --- |
| `loadStoryDocument(directory)` | 读取 `story.json`，返回剧情与原始文件字节的 SHA-256 `revision` |
| `validateStoryDocument(directory, story)` | 使用作品现有 `game.json`、`assets.json` 和真实素材验证候选剧情 |
| `saveStoryDocument(directory, { story, expectedRevision })` | 版本匹配且候选合法时保存，返回新文件版本 |

本阶段保存只修改 `story.json`。入口与作品信息仍以 `game.json` 为准，素材映射仍以 `assets.json` 为准。`setEntry()` 只改变内存草稿；需要发布新的入口时同时手动修改作品的 `game.json` 再校验。本阶段不提供三个文件的联合事务，避免把半完成的多文件写入当成安全保存。

保存先验证候选，再写同目录的独占临时文件，最后以文件替换提交；不为验证覆盖正式剧情。保存前再次检查磁盘版本，版本冲突时拒绝覆盖，作者应重新读取后合并。同一进程内对同一文件的保存按顺序处理。

该版本检查防止已知旧副本覆盖和同进程并发冲突，不承诺能锁住任何外部编辑器：外部程序仍可能在最后检查与提交之间写文件。制作时避免多个程序同时写同一个剧情文件。

### 显式重载预览

`npm run dev -- --game <ID>` 的开发窗口提供“重新载入预览（从头开始）”。它重新读取并校验作品配置、剧情和素材映射，成功后对原会话应用 restart，更新剧情界面并在入口等待玩家开始；视频元素和音量保留。

校验失败时保持当前会话和素材映射，显示错误并允许修复后重试。重复点击不会启动并行重载。只要还在读取候选，旧会话就继续使用旧内容。

每次成功读取分配独立 `loadId`，媒体 URL 指向该次加载的素材映射；没有播放源再使用旧映射时释放它。这样更换同一个素材 ID 的文件路径不会让旧会话误读新路径。映射版本不复制视频文件字节；直接覆盖正在播放的同一个物理文件仍可能影响旧流，制作时优先放入新文件并修改映射。

“应用文件更新”还可选择重播当前节点或保留兼容进度，具体见下文 B。发布构建不显示制作工具条，玩家继续运行已打包内容。

### 调用示例

以下是 Node.js 制作脚本示例。先按 [新建教程](new-game-tutorial.md) 创建 `my-game`，将脚本保存为 `tools/edit-my-game.mts`，执行 `node --import tsx tools/edit-my-game.mts`。它修改第一个结局的标题，其他内容保持原样：

```ts
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { StoryEditor } from '../src/authoring';
import { loadStoryDocument, saveStoryDocument } from '../src/authoring/work-store';

const directory = path.resolve('games/my-game');
const source = await loadStoryDocument(directory);
const game = JSON.parse((await readFile(path.join(directory, 'game.json'), 'utf8')).replace(/^\uFEFF/, ''));
const editor = new StoryEditor(source.story, game.entryNodeId);
const ending = editor.export().story.nodes.find((node) => node.type === 'end');
if (!ending) throw new Error('先为这部作品添加一个结局。');

editor.updateNode({ ...ending, title: '我们新的故事' });
// editor.undo(); editor.redo(); 可以撤销或恢复这次编辑。
const saved = await saveStoryDocument(directory, {
  story: editor.export().story,
  expectedRevision: source.revision,
});
console.log('剧情已保存，新版本：', saved.revision);
```

`saveStoryDocument` 会再次验证作品入口、整个剧情图与素材，因此只需要调用方保留最初读取的 `revision`。版本冲突时应重新读取并合并修改，不自动改用最新哈希强行覆盖。

也可以先将完整候选 `story.json` 放到 `drafts/my-game.story.json`，在项目根目录执行：

```powershell
# 只校验候选，不修改正式文件；输出当前磁盘剧情的 revision
npm run story -- --game my-game --input drafts/my-game.story.json

# 检查结果后，把 <revision> 替换为上一步输出的哈希，显式保存
npm run story -- --game my-game --input drafts/my-game.story.json --write --expected-revision <revision>
```

CLI 的 `--write` 必须提供预期版本，后续磁盘文件发生变化就会拒绝保存。候选文件如果已经保存很久，应先比较当前内容再决定是否提交；哈希校验无法推断一个手工 JSON 文件最初基于哪个版本。

保存后，在 `npm run dev -- --game my-game` 窗口点击“重新载入预览（从头开始）”。普通 `npm start` 会重新构建最新内容；已有发布包仍需重新打包。

## B 运行中应用内容

已实现 `StorySession.applyContent(candidate, options)`。策略为 `restart`、`replay-node`、`preserve`；候选校验失败保留原状态，保留视频进度时用内容指纹确认兼容，并延迟释放旧播放所需的素材映射。完整签名、示例和生命周期见 [动态更新 API](dynamic-content-api.md)。

## C 播放动效

已实现 `EffectsPlayer` 与 `CueScheduler`。统一句柄支持暂停、恢复、取消及区分完成原因，媒体触发器明确处理拖动、回退、换源和缓冲；节点可配置淡入/上移入场。完整接口见 [动效 API](effects-api.md)。动效不自行推进剧情；当前不提供双视频交叉溶解或无缝切片。

## D 可视化编辑器

开发窗口“流程编辑器”已接入节点图、拖动排版、缩放、字段和目标编辑、撤销重做、校验、安全保存、未保存提醒与草稿预览。入口固定来自 game.json，素材列表来自 assets.json。用法和限制见 [可视化编辑器教程](visual-editor-guide.md)。

## 验证

行为测试覆盖草稿隔离与历史、存储冲突、动态内容事务、视频指纹和源代次、动效取消/恢复、媒体时间触发和编辑器状态。真实 Electron 制作验证使用临时作品副本，避免改动正式作品。最终审查与执行结果见 [制作功能 Review](review-authoring.md)。
