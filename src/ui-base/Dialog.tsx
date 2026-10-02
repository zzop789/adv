import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

export interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  closeLabel?: string;
}

/** Mount to open, unmount to close. Native modality supplies inertness and focus containment. */
export function Dialog({ title, children, onClose, className = '', closeLabel = '关闭' }: DialogProps) {
  const element = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = element.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const cancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    const close = () => {
      // A close queued by Strict Mode cleanup can arrive after the same element reopens.
      if (!dialog.open) onCloseRef.current();
    };
    dialog.addEventListener('cancel', cancel);
    dialog.addEventListener('close', close);
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.removeEventListener('close', close);
      if (dialog.open) dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={element} className={`ui-dialog ${className}`.trim()} aria-labelledby={titleId}>
    <header className="ui-dialog__header">
      <h2 id={titleId} className="ui-dialog__title">{title}</h2>
      <Button className="ui-dialog__close" aria-label={closeLabel} onClick={onClose} autoFocus>
        {closeLabel}
      </Button>
    </header>
    <div className="ui-dialog__content">{children}</div>
  </dialog>;
}
