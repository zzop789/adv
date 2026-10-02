# 运行中内容更新 API

本地制作窗口和作品代码共用 `StorySession.applyContent()`。读取候选、校验图和素材后才应用；候选读取、校验或兼容检查失败返回错误，保留当前剧情、视频和播放状态。

## 调用

```ts
import { StorySession } from '../src/runtime/session';
import type { SessionContent } from '../src/runtime/types';

// session 是宿主已创建的 StorySession；loaded 来自 desktop.loadGame()
const candidate: SessionContent = {
  story: loaded.story,
  entryNodeId: loaded.game.entryNodeId,
  mediaUrls: loaded.videoUrls,
  mediaRevisions: loaded.mediaRevisions,
};
const result = session.applyContent(candidate, { strategy: 'preserve' });
if (!result.ok) console.error(result.error);
```

| 策略 | 行为 |
| --- | --- |
| `restart` | 应用新剧情，从新入口开始，视频等待手动播放 |
| `replay-node` | 默认重新进入当前 ID 的节点；可传 `nodeId` 预览指定节点，视频从零等待播放 |
| `preserve` | 当前节点 ID 和类型必须存在且不变；保留视频源、秒数、播放/暂停状态，更新后续路线和界面内容 |

`nodeId` 仅供 `replay-node` 使用。重播是明确放弃当前进度的操作，因此允许目标节点改变类型；保留策略拒绝类型变化、当前节点删除或当前素材 ID 变化，不静默跳到其他路线。

所有策略仍使用同一 `StorySession` 和播放控制器，保留音量。成功应用后 `visitId` 递增，旧选项回调失效；重播/重新开始在重新加载视频时还会切换 `sourceId`，旧视频回调不能推进新节点。进入选择/结局会保留上一段的源和末帧。`restart` 递增 `runId`。候选校验或兼容检查失败不递增这些代次。

文件存在且剧情合法不等于视频一定能解码。新内容提交后才发生的加载或解码失败，会停在新节点的错误状态，提供重试；此时不会回滚旧视频。

## 怎样确认视频兼容

开发态桌面内容加载为每个视频生成 SHA-256 `mediaRevisions`。`preserve` 要求当前视频的旧、新指纹相同；文件改名或换路径但字节相同时仍能保留播放。同 ID 的文件重新剪辑或重编码后指纹变化，应选择重播节点。

代码调用方若有一侧未提供指纹，只允许相同媒体 URL 作为兼容后备判断；URL 相同不等于物理文件未被覆盖，所以本地开发加载始终提供指纹。不要伪造版本号声称不同内容相同。

指纹计算采用流式读取，并按文件身份、大小和时间元数据缓存，避免每次编辑文字都重读大视频。首次读取大型作品仍会花时间；读取期间旧播放可以继续。指纹不是视频副本，已加载映射也不是文件快照：不要原地覆盖正在播放的文件，优先新增文件后修改 `assets.json`。

## 素材版本生命周期

每次候选加载有独立 `loadId` 和媒体 URL。渲染宿主在保留进度时继续使用旧视频 URL，保留当前视频所属版本；后续节点使用新版本。只保留最新内容和当前实际视频所需版本，换源后释放不再使用的旧版本。

运行时不直接读取文件，也不自行回收桌面映射。自行接入 `applyContent()` 的宿主必须复用或实现相同的版本持有/释放规则，不能应用后立即释放仍在播放的旧 URL。现有实现见 `src/renderer/player/useContentLeases.ts`。

## 开发窗口

启动 `npm run dev -- --game demo`，修改磁盘剧情、素材映射或作品文案后，在“制作预览”工具条选择策略，点击“应用文件更新”。“重新载入预览（从头开始）”是 `restart` 快捷入口。

流程编辑器的“预览未保存草稿”使用同一接口，但候选来自内存，不先写磁盘。保存和预览是两个明确操作。作品 ID、程序名、图标等构建身份变化后仍应重启开发命令，并在发布前重新打包。

发布包包含运行时内容更新 API，可供作品代码组织内存内容；玩家窗口不提供制作读取/写入接口，也没有在线分发或自动监视文件功能。正常发布包启动不会遍历读取整部作品的视频计算指纹；自行实现运行中保留策略的作品代码须管理可信的内容版本或复用已加载 URL。
