import type { ContentUpdateOptions } from '../../runtime/types';
import type { DraftSnapshot } from '../state/draft-history';

interface Props {
  busy: boolean;
  loaded: boolean;
  draft: DraftSnapshot;
  strategy: ContentUpdateOptions['strategy'];
  onStrategy(strategy: ContentUpdateOptions['strategy']): void;
  onUndo(): void;
  onRedo(): void;
  onReload(): void;
  onValidate(): void;
  onSave(): void;
  onPreview(): void;
}

export function EditorToolbar(props: Props) {
  const { busy, loaded, draft, strategy } = props;
  return <div className="editor-toolbar">
    <button disabled={busy || !draft.canUndo} onClick={props.onUndo}>撤销</button>
    <button disabled={busy || !draft.canRedo} onClick={props.onRedo}>重做</button>
    <button disabled={busy} onClick={props.onReload}>重新读取</button>
    <button disabled={busy || !loaded} onClick={props.onValidate}>校验剧情</button>
    <button disabled={busy || !draft.dirty} onClick={props.onSave}>保存剧情</button>
    <span className={draft.dirty ? 'editor-dirty' : 'editor-hint'}>
      {draft.dirty ? '有未保存修改' : '已与磁盘同步'}
    </span>
    <select aria-label="草稿预览策略" value={strategy} disabled={busy}
      onChange={(event) => props.onStrategy(event.target.value as typeof strategy)}>
      <option value="restart">从头开始</option>
      <option value="replay-node">重播当前节点</option>
      <option value="preserve">保留进度</option>
    </select>
    <button disabled={busy || !loaded} onClick={props.onPreview}>预览未保存草稿</button>
  </div>;
}
