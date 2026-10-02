interface Props {
  action: 'close' | 'reload';
  onCancel(): void;
  onDiscard(): void;
}

export function DirtyPrompt({ action, onCancel, onDiscard }: Props) {
  return <div className="editor-confirm" role="alertdialog" aria-label="未保存修改">
    <p>有未保存修改，{action === 'close' ? '关闭后将丢弃这些草稿。' : '重新读取将用磁盘内容覆盖这些草稿。'}</p>
    <button onClick={onCancel}>继续编辑</button>
    <button onClick={onDiscard}>放弃修改并{action === 'close' ? '关闭' : '重新读取'}</button>
  </div>;
}
