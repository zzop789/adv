import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthoringApi, AuthoringDocument } from '../../authoring/contracts';
import { DraftHistory } from './draft-history';
import { saveDraft } from './save-draft';

export function useEditorDocument(api: AuthoringApi) {
  const [document, setDocument] = useState<AuthoringDocument | null>(null);
  const [history, setHistory] = useState<DraftHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const locked = useRef(false);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败。');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);
  const reload = useCallback(() => run(async () => {
    const result = await api.read();
    if (!result.ok) throw new Error(result.error);
    setDocument(result.value);
    setHistory(new DraftHistory(result.value.story));
    setMessage('已读取磁盘剧情。');
  }), [api, run]);
  useEffect(() => { void reload(); }, [reload]);
  const validate = () => run(async () => {
    if (!history) return;
    const result = await api.validate(history.getSnapshot().story);
    if (!result.ok) throw new Error(result.error);
    setMessage('校验通过，可以保存或预览。');
  });
  const save = () => run(async () => {
    if (!history || !document) return;
    const revision = await saveDraft(api, history, document.revision);
    setDocument({ ...document, revision });
    setMessage('剧情已保存到 story.json。');
  });
  return { document, history, busy, message, error, setError, run, reload, validate, save };
}
