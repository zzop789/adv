import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AuthoringApi } from '../authoring/contracts';
import type { ContentUpdateOptions, StoryDefinition, StoryNode } from '../runtime/types';
import { useEditorDocument } from './state/useEditorDocument';
import { newNode } from './state/draft-history';
import FlowGraph from './graph/FlowGraph';
import NodeInspector from './inspector/NodeInspector';
import { EditorToolbar } from './components/EditorToolbar';
import { DirtyPrompt } from './components/DirtyPrompt';
import './editor.css';

interface Props {
  api: AuthoringApi;
  workId: string;
  visible: boolean;
  onClose(): void;
  onPreview(story: StoryDefinition, options: ContentUpdateOptions): Promise<boolean>;
}
const empty = { story: { schemaVersion: 1 as const, nodes: [] }, dirty: false, canUndo: false, canRedo: false };
const emptySubscribe = () => () => {};

export default function EditorPanel({ api, workId, visible, onClose, onPreview }: Props) {
  const state = useEditorDocument(api);
  const draft = useSyncExternalStore(state.history?.subscribe ?? emptySubscribe, state.history?.getSnapshot ?? (() => empty));
  const [selected, setSelected] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<ContentUpdateOptions['strategy']>('restart');
  const [confirm, setConfirm] = useState<'close' | 'reload' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (visible && !dialog.current?.open) dialog.current?.showModal();
    else if (!visible && dialog.current?.open) dialog.current.close();
  }, [visible]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!draft.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft.dirty]);
  const request = (action: 'close' | 'reload') => {
    if (state.busy) return;
    if (draft.dirty) setConfirm(action);
    else if (action === 'close') onClose();
    else void state.reload();
  };
  const add = (type: StoryNode['type']) => {
    if (!state.history || !state.document) return;
    const node = newNode(type, draft.story, state.document.mediaIds, state.document.entryNodeId);
    state.history.edit((story) => story.nodes.push(node));
    setSelected(node.id);
  };
  const preview = (options: ContentUpdateOptions) => void state.run(async () => {
    const result = await api.validate(draft.story);
    if (!result.ok) throw new Error(result.error);
    if (!await onPreview(result.value.story, options)) {
      throw new Error('草稿未能应用；当前播放保留。请查看制作预览工具中的原因。');
    }
  });
  const remove = (id: string) => {
    state.history?.edit((story) => { story.nodes = story.nodes.filter((node) => node.id !== id); });
    setSelected(null);
  };
  const discard = () => {
    setConfirm(null);
    if (confirm === 'close') onClose();
    else void state.reload();
  };
  const node = draft.story.nodes.find((n) => n.id === selected);
  return <dialog ref={dialog} className="editor-dialog" aria-labelledby="editor-title" onCancel={(event) => { event.preventDefault(); request('close'); }}>
    <header className="editor-header">
      <div><span>ADV / AUTHORING</span><h1 id="editor-title">流程编辑器 <small>{state.document?.title ?? '读取中'}</small></h1></div>
      <button disabled={state.busy} onClick={() => request('close')}>关闭编辑器</button>
    </header>
    <EditorToolbar busy={state.busy || Boolean(confirm)} loaded={Boolean(state.history)} draft={draft}
      strategy={strategy} onStrategy={setStrategy} onUndo={() => state.history?.undo()}
      onRedo={() => state.history?.redo()} onReload={() => request('reload')}
      onValidate={() => void state.validate()} onSave={() => void state.save()}
      onPreview={() => preview({ strategy })} />
    <div className="editor-status" role={state.error ? 'alert' : 'status'}>{state.busy ? '正在处理…' : state.error || state.message || '编辑剧情节点，连接后先校验，再保存或预览。'}
      {state.document && <span>入口：{state.document.entryNodeId}（game.json，只读）</span>}</div>
    {confirm && <DirtyPrompt action={confirm} onCancel={() => setConfirm(null)} onDiscard={discard} />}
    <fieldset disabled={state.busy || Boolean(confirm)} className="editor-workspace">
      <nav className="editor-add" aria-label="添加节点"><h2>添加节点</h2>
        <button onClick={() => add('video')}>＋ 视频</button>
        <button onClick={() => add('choice')}>＋ 选择</button>
        <button onClick={() => add('end')}>＋ 结局</button>
        <p>选中节点后，在右侧选择连接目标。删除节点后须修复入边。</p>
        <small>节点排版仅存于本机，不写入剧情。</small>
      </nav>
      <FlowGraph story={draft.story} entryNodeId={state.document?.entryNodeId ?? ''} selectedId={selected} onSelect={setSelected} workId={workId} />
      <NodeInspector node={node} story={draft.story} entry={state.document?.entryNodeId ?? ''} mediaIds={state.document?.mediaIds ?? []}
        onChange={(next) => state.history?.update(next)} onDelete={remove}
        onPreview={() => node && preview({ strategy: 'replay-node', nodeId: node.id })} />
    </fieldset>
  </dialog>;
}
