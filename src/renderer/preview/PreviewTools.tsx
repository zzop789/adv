import { useState, useSyncExternalStore } from 'react';
import type { ContentUpdateOptions } from '../../runtime/types';
import type { PreviewController } from '../preview-controller';

export default function PreviewTools({ preview, canEdit, onEdit }: { preview: PreviewController; canEdit: boolean; onEdit(): void }) {
  const { error, loading } = useSyncExternalStore(preview.subscribe, preview.getSnapshot);
  const [strategy, setStrategy] = useState<ContentUpdateOptions['strategy']>('preserve');
  return <aside className="adv-preview-tools" aria-label="制作预览工具" aria-busy={loading}>
    <div className="adv-preview-tools-row">
      <span className="adv-preview-label">制作预览</span>
      {canEdit && <button disabled={loading} onClick={onEdit}>流程编辑器</button>}
      <select aria-label="动态更新策略" value={strategy} onChange={(event) => setStrategy(event.target.value as typeof strategy)}>
        <option value="preserve">保留当前进度</option><option value="replay-node">重播当前节点</option><option value="restart">从头开始</option>
      </select>
      <button disabled={loading} onClick={() => void preview.load({ strategy })}>应用文件更新</button>
      <button disabled={loading} onClick={() => void preview.load()}>{loading ? '正在重新载入…' : '重新载入预览（从头开始）'}</button>
    </div>
    {error && <p className="adv-preview-error" role="alert">重新载入失败，当前播放已保留：{error}</p>}
  </aside>;
}
