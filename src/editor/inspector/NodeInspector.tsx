import type { StoryDefinition, StoryNode } from '../../runtime/types';
import { Field, TargetSelect } from '../components/Fields';
import ChoiceFields from './ChoiceFields';

interface Props {
  node: StoryNode | undefined;
  story: StoryDefinition;
  entry: string;
  mediaIds: string[];
  onChange(node: StoryNode): void;
  onDelete(id: string): void;
  onPreview(): void;
}
export default function NodeInspector({ node, story, entry, mediaIds, onChange, onDelete, onPreview }: Props) {
  if (!node) return <aside className="editor-inspector"><h2>节点属性</h2><p>点选画布中的节点，或新建一个节点。</p></aside>;
  const effect = node.effect ?? { preset: 'none' as const, durationMs: 500 };
  const updateEffect = (patch: Partial<typeof effect>) => onChange({ ...node, effect: { ...effect, ...patch } });
  return <aside className="editor-inspector" aria-label="节点属性">
    <h2>{node.id} {node.id === entry && <small>入口</small>}</h2>
    <p className="editor-hint">类型：{node.type} · ID 创建后固定</p>
    {node.type === 'video' && <>
      <Field label="视频素材">
        <select aria-label="视频素材" value={node.mediaId} onChange={(event) => onChange({ ...node, mediaId: event.target.value })}>
          <option value="">选择素材</option>
          {mediaIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </Field>
      <TargetSelect label="后续节点" value={node.next} story={story} onChange={(next) => onChange({ ...node, next })} />
    </>}
    {node.type === 'choice' && <ChoiceFields node={node} story={story} onChange={onChange} />}
    {node.type === 'end' && <>
      <Field label="结局标题">
        <input aria-label="结局标题" value={node.title} onChange={(event) => onChange({ ...node, title: event.target.value })} />
      </Field>
      <Field label="结局描述">
        <textarea aria-label="结局描述" value={node.description} onChange={(event) => onChange({ ...node, description: event.target.value })} />
      </Field>
    </>}
    <hr />
    <Field label="入场动效">
      <select aria-label="入场动效" value={effect.preset}
        onChange={(event) => updateEffect({ preset: event.target.value as typeof effect.preset })}>
        <option value="none">无动效</option>
        <option value="fade">淡入</option>
        <option value="slide-up">向上滑入</option>
      </select>
    </Field>
    <Field label="动效时长（毫秒）">
      <input aria-label="动效时长（毫秒）" type="number" min={0} max={10000} step={50} value={effect.durationMs}
        onChange={(event) => updateEffect({ durationMs: Number(event.target.value) })} />
    </Field>
    <div className="editor-inspector-actions">
      <button onClick={onPreview}>从此节点预览</button>
      <button className="editor-danger" disabled={node.id === entry}
        title={node.id === entry ? '入口固定在 game.json，不能在此删除。' : undefined} onClick={() => onDelete(node.id)}>删除节点</button>
    </div>
    {node.id === entry && <p className="editor-hint">入口由 game.json 决定，本轮只读。</p>}
  </aside>;
}
