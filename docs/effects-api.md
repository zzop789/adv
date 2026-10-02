# 统一动效与媒体时间标记

入口为 `src/presentation/effects/index.ts`。这些模块只处理 DOM 演出和媒体时间标记，不修改剧情、不决定跳转，也不访问文件。无需新增第三方依赖。

## 任意 UI 的动效

```ts
import { EffectsPlayer } from '../presentation/effects';

const effects = new EffectsPlayer();
const handle = effects.play(panel, 'slide-up', {
  durationMs: 240,
  easing: 'ease-out',
});

handle.pause();
handle.resume();
const result = await handle.finished;
if (result.status === 'completed') {
  // 只做本次演出完成后的界面工作；cancelled 不代表演出完成。
}

handle.cancel();       // 取消本次演出，并释放它保留的视觉终态。
effects.cancel(panel); // 取消指定目标的当前演出。
effects.dispose();     // 界面卸载时取消全部演出。
```

可用预设：`fade-in`、`fade-out`、`slide-up`。默认时长 240ms，默认 easing 为 `ease-out`，可传入原生 Web Animations 支持的 easing。`durationMs` 必须是非负有限数值。

同一个 `EffectsPlayer` 对同一元素只保留一个演出。新的 `play()` 会取消旧演出；旧句柄的 `finished` 得到 `{ status: 'cancelled' }`，不会误报完成。不同元素可同时演出。需要统一替换行为的调用方应共享同一个 player。

完成后保留最终视觉状态，直至句柄取消、同目标新演出替换或 player 销毁；不改写元素原有 inline style。`fade-out` 因此不会在完成时自动闪回。已完成句柄的结果不会因之后清理终态而改变。

每次开始都会检查系统 `prefers-reduced-motion`。开启时仅应用终态，时长为 0，并立即返回 `completed`。销毁后的 `play()` 返回 `cancelled`，不再创建动画。

作品剧情配置的 `effect.preset` 如果使用 `none | fade | slide-up`，由表现层映射：`none` 跳过、`fade` 调用 `fade-in`。剧情内核无需了解 DOM 动画。

三类剧情节点都可附带可选的 `effect`，例如：

```json
{
  "id": "opening",
  "type": "video",
  "mediaId": "opening_video",
  "next": "direction",
  "effect": { "preset": "fade", "durationMs": 400 }
}
```

节点配置时长范围为 0–10000 毫秒，不配置则直接显示。视频节点作用于视频宿主；选择和结局作用于实际剧情界面。切换节点或应用新内容会清理旧入场效果，菜单暂停和播放器等待会暂停正在进行的效果。此配置负责入场；界面退场可在作品代码中使用 `fade-out` 句柄并等待完成后关闭界面。

## 跟随视频时间的标记

```ts
import { CueScheduler, EffectsPlayer } from '../presentation/effects';

const effects = new EffectsPlayer();
const cues = new CueScheduler({
  cues: [
    { id: 'hint', at: 2.5, run: () => effects.play(hint, 'fade-in') },
    { id: 'hide-hint', at: 4, run: () => effects.play(hint, 'fade-out') },
  ],
  seek: 'skip',
  rewind: 'once-per-source',
});

// 每次收到媒体状态或时间变化时传入，不使用墙钟定时器推进标记。
cues.update({
  sourceId: snapshot.sourceId,
  currentTime: snapshot.currentTime,
  status: snapshot.status,
  seeking: video.seeking,
});

// 卸载时，两者都应清理。
cues.dispose();
effects.dispose();
```

- `at` 单位为秒；ID 必须唯一，时间必须非负且有限。同时间的标记按声明顺序执行。
- 正常 `playing` 更新执行上次时间到本次时间之间尚未执行的标记；`ended` 也补齐自然播放最后一段的标记。单次更新跨度大仍是正常时间推进。
- `paused`、`loading`、`buffering` 等状态不触发标记，并暂停由标记返回的动效句柄；恢复 `playing` 时继续。时间游标仍同步到传入位置，不在恢复时补发暂停期间跨过的标记。
- 主动跳转必须传 `seeking: true`。默认 `seek: 'skip'` 跳过跨过的标记；`fire-crossed` 仅在播放状态的向前跳转中执行跨过的标记。暂停状态跳转不会触发标记。
- 倒退时间会取消旧演出。默认 `rewind: 'once-per-source'` 保留已经执行的记录；`rearm` 清空记录，之后重新播放跨过的标记可再次执行。
- `sourceId` 变化会取消旧演出并清空标记记录。第一次收到某源的位置大于零时，不补发该位置之前的标记；位于该位置的标记可以正常执行。
- 标记要让调度器管理动效的暂停和清理，必须返回 `EffectHandle`。只返回 `void` 的自定义副作用由调用方自行管理。
- 源切换、跳转、倒退和销毁都清理此前返回的动效。回调同步切换源或销毁调度器时，不会继续执行旧源剩余标记。

`EffectsPlayer` 可注入 `animate` 和 `prefersReducedMotion`；测试使用最小动画接口，不需要真实 DOM 或等待时钟。`CueScheduler` 本身也不使用 DOM、`setTimeout` 或定时器。

## 目录

`effects/types.ts` 定义契约，`presets.ts` 定义帧，`handle.ts` 处理完成和取消，`player.ts` 管理目标，`cues.ts` 管理媒体标记。视频播放器另放 `presentation/video/`，旧 `presentation/video-controller.ts` 只保留兼容导出。
