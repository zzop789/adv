import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { PreviewController } from '../preview';
import Player from '../player/Player';
import PreviewTools from '../preview/PreviewTools';

const EditorPanel = import.meta.env.DEV ? lazy(() => import('../../editor')) : null;

export default function App() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);
  const [preview] = useState(() => new PreviewController({
    loadGame: () => window.adv ? window.adv.loadGame() : Promise.reject(new Error('请通过桌面程序启动作品。')),
    releaseGame: (id) => window.adv.releaseGame(id),
  }));
  const { content, error, loading } = useSyncExternalStore(preview.subscribe, preview.getSnapshot);
  useEffect(() => { void preview.load(); return () => preview.dispose(); }, [preview]);
  useEffect(() => { if (content) document.title = content.game.title; }, [content]);
  if (content) return <>
    <Player content={content} preview={preview} editorOpen={editorOpen} />
    {content.previewEnabled && <PreviewTools preview={preview} canEdit={Boolean(EditorPanel && window.adv.authoring)} onEdit={() => { setEditorMounted(true); setEditorOpen(true); }} />}
    {editorMounted && EditorPanel && window.adv.authoring && <Suspense fallback={<div className="adv-editor-loading" role="status">正在打开流程编辑器…</div>}>
      <EditorPanel api={window.adv.authoring} workId={content.game.id} visible={editorOpen}
        onClose={() => { setEditorOpen(false); setEditorMounted(false); }}
        onPreview={async (story, options) => {
          const ok = await preview.load(options, () => window.adv.authoring!.preview(story));
          if (ok) setEditorOpen(false);
          return ok;
        }} />
    </Suspense>}
  </>;
  return <main className="adv-shell-state">
    <span className="adv-shell-eyebrow">ADV / LOCAL CINEMA</span>
    <h1>{loading ? '正在准备演出' : '暂时无法打开作品'}</h1>
    <p role={error ? 'alert' : undefined}>{error ?? '正在读取本地内容。'}</p>
    {error && <button disabled={loading} onClick={() => void preview.load()}>重新加载</button>}
  </main>;
}
