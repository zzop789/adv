import { useEffect, useRef } from 'react';
import type { EndingScreenProps } from '../../../../src/ui/contracts';
import { Button } from '../../../../src/ui-base';
import '../styles.css';

export default function EndingScreen({ title, description, onRestart }: EndingScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [title]);
  return (
    <div className="demo-overlay demo-overlay--story">
      <div className="demo-overlay-content demo-ending">
        <span className="demo-overlay-kicker">故事落幕 · THE END</span>
        <h2 ref={headingRef} tabIndex={-1}>{title}</h2>
        <p>{description}</p>
        <Button appearance="primary" className="demo-button demo-button--primary" onClick={onRestart}>重新开始</Button>
      </div>
    </div>
  );
}
