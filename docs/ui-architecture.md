# UI 控件、独立界面与代码调用

日期：2026-10-02。当前架构把控件、界面、布局和调用管理分开。两部样例作品已经迁移，剧情执行器和播放器不依赖具体界面。

## 四个职责

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 通用控件 | `src/ui-base/` | Button、Slider、ChoiceList、Dialog、TimeLabel；负责交互和可访问性，外观可覆盖 |
| 独立界面 | `games/<ID>/ui/screens/`、`src/ui/screens/` | 接收数据与回调，组合控件；不读取文件、不持有剧情会话 |
| 作品布局 | `games/<ID>/ui/Layout.tsx` | 放置视频、播放控制及界面插槽，决定整部作品的空间布局 |
| 调用管理 | `src/ui/ui-manager.ts`、`UIHost.tsx` | 按名称打开、更新、关闭和切换界面，管理实例及层次 |

`src/ui/player-ui.ts` 是应用与 UI 之间的协调代码：把剧情状态转换成界面参数，把玩家操作交给会话。暂停恢复规则也在这里，通用控件与 UIManager 不需要知道什么是视频或剧情。

```text
StorySession → player-ui → UIManager → UIOutlet → 独立界面 → 通用控件
      ↑                                             │
      └──────────────── 操作回调 ────────────────────┘
```

## 用代码调用界面

React 组件在 `UIHost` 内使用 `useUI()` 获取管理器；普通 TypeScript 业务函数通过参数接收同一个管理器。不使用全局单例，多个游玩实例之间不共享界面状态。

```tsx
import { useUI } from '../src/ui';

function OpenChoiceButton() {
  const ui = useUI();
  return <button onClick={() => ui.show('choice', {
    prompt: '想去哪里？',
    options: [
      { id: 'harbor', label: '去港口' },
      { id: 'home', label: '回家' },
    ],
    onChoose: (id) => {
      console.log('玩家选择：', id);
      ui.close('choice');
    },
  })}>显示选择</button>;
}
```

这是任意 UI 的调用示例，回调由调用者决定。正式剧情选择由 `player-ui.ts` 绑定，保留当前 `visitId` 再交给 `StorySession.choose`，避免过期界面误选新剧情。应用代码不应该绕过会话直接修改剧情位置。

| 方法 | 语义 |
| --- | --- |
| `ui.open(name, props)` | 打开或更新同名界面，并将其放到逻辑顺序末尾；保留其他界面 |
| `ui.show(name, props)` | 打开或更新指定界面，原子关闭同层的其他界面 |
| `ui.close(name)` | 关闭当前同名实例，不存在时无副作用 |
| `ui.closeLayer(layer)` | 清理某个层的界面 |
| `ui.closeTop(layer?)` | 关闭指定层或全部界面中最后打开的实例 |
| `ui.isOpen(name)` | 查询界面是否打开 |

名称与参数类型在 `src/ui/contracts.ts` 定义，传错参数会被 TypeScript 检查。打开方法返回实例句柄：

```ts
import type { UIManager, UIScreenParams } from '../src/ui';

function presentSettings(ui: UIManager<UIScreenParams>, props: UIScreenParams['settings']) {
  const panel = ui.open('settings', props);
  // 稍后刷新全部参数；不会重建这个实例。
  panel.update({ ...props, volume: 0.5 });
  return panel;
}
```

调用者可以保存返回的 `panel`，稍后执行 `panel.close()`。界面关闭后重新打开会获得新的 `instanceId`；旧句柄的 `close` 和 `update` 不会影响新实例。`update` 接受完整参数对象，参数包含回调时不进行深拷贝。变更数据时应传入新的参数对象。

## 界面也可以单独使用

每个 Screen 都是普通 React 组件，可以不经过 UIManager，直接传入参数用于页面组合或预览。例如下面的界面不需要创建 Electron 窗口、剧情图或视频会话：

```tsx
import ChoiceScreen from '../games/demo/ui/screens/ChoiceScreen';

function Preview() {
  return <div style={{ position: 'relative', width: 900, height: 500 }}>
    <ChoiceScreen
      prompt="下一步怎么办？"
      options={[{ id: 'continue', label: '继续前进' }]}
      onChoose={(id) => console.log(id)}
    />
  </div>;
}
```

独立使用仍需给界面合适的布局区域和主题。示例 ChoiceScreen 是覆盖式界面，需要相对定位的容器。共享 SettingsScreen 的参数仅包含音量、音量修改回调、全屏回调和关闭回调；单独使用时由调用者移除组件完成关闭。

## 替换作品界面与添加新界面

作品的 `ui/index.tsx` 只负责注册实现：

```tsx
export default {
  Layout,
  screens: {
    playback: PlaybackScreen,
    choice: ChoiceScreen,
    ending: EndingScreen,
    // 可选：settings: CustomSettingsScreen
  },
} satisfies WorkUI;
```

改一个界面只替换对应组件，改作品总体布局只修改 Layout。两部作品共用控件和管理器，但保留各自布局、样式与文字。

新增界面的步骤：

1. 编写只接收 props 与回调的 Screen，优先组合 `src/ui-base` 控件。
2. 在 `UIScreenParams` 增加界面名及参数类型，在 `createPlayerUI()` 注册对应层。
3. 在 `UIHost` 的组件注册表提供实现，需要作品替换时再扩展 `WorkUI.screens`。
4. 通过 `ui.open` 或 `ui.show` 调用。既有层已经有 UIOutlet，无需改窗口或播放器。

UIManager 本身是泛型纯 TypeScript 类，也可以通过独立参数表和注册表用于其他工具界面。当前 UIHost 是 ADV 应用的类型适配层，扩展应用界面要同步上述参数与注册表。

## 生命周期和层次规则

当前注册了 `playback`、`story`、`modal` 三层。Layout 决定每层出现的位置：雾港把选择放在视频上，余光来信把选择放在右侧信笺。`UIOutlet` 只负责把当前界面渲染到指定位置。

`modal` 插槽使用 `topOnly`：只挂载最上层界面，较低层仍保留管理器中的参数，返回时重新挂载。这避免多个原生 dialog 的视觉顺序与管理器顺序不一致。需要保留的表单数据应放在参数或调用方状态中，不依赖卸载后的局部 state。

视频元素始终位于 Layout 的固定宿主中，属于播放会话。弹出、关闭、切换界面不会加载另一段视频或重置播放进度。

当前设置示例复用已有音量与全屏功能。模态界面打开时，协调层暂停正在播放的片段；最后一个模态界面关闭后，仅在节点和视频代次都未改变时恢复原播放。原本准备就绪或已经暂停的片段不会自动开始。`Esc` 优先关闭最上层弹窗，再退出全屏。设置尚未持久化，存档与完整菜单仍在阶段 4。

## 验证与审查

此次改造新增 31 项控件、UIManager 和应用协调层测试，全库共 76 项；覆盖独立参数、实例复用、过期句柄、同层切换、重入通知、暂停恢复、过期剧情回调与销毁。真实 Electron 和两个便携 EXE 继续验证原有分支，并验证弹窗焦点、Esc、音量及同一视频元素保持。

审查修复了同步回调中重开导致旧界面残留、打开时立即关闭无效、初始已有弹窗却未暂停、打开期间音量更新丢失，以及销毁后旧流程继续打开界面等问题。Dialog 还独立验证了 React StrictMode 下反复挂载和焦点恢复。
