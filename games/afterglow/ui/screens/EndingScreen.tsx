import { useEffect, useRef } from 'react';
import type { EndingScreenProps } from '../../../../src/ui/contracts';
import { Button } from '../../../../src/ui-base';
import '../styles.css';

export default function EndingScreen({ title, description, onRestart }: EndingScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [title]);
  return (
    <div className="afterglow-letter-body afterglow-letter-ending">
      <p className="afterglow-letter-kicker">信的最后一行</p>
      <h2 ref={headingRef} tabIndex={-1}>{title}</h2>
      <p>{description}</p>
      <div className="afterglow-letter-rule" />
      <span className="afterglow-end-mark">愿每一句未尽之言，都有回响。</span>
      <Button className="afterglow-button" onClick={onRestart}>重新开始</Button>
    </div>
  );
}
