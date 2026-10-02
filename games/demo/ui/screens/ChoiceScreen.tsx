import { useEffect, useRef } from 'react';
import type { ChoiceScreenProps } from '../../../../src/ui/contracts';
import { ChoiceList } from '../../../../src/ui-base';
import '../styles.css';

export default function ChoiceScreen({ prompt, options, onChoose }: ChoiceScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [prompt, options]);
  return (
    <div className="demo-overlay demo-overlay--story">
      <div className="demo-story-panel">
        <span className="demo-overlay-kicker">每一个选择，都通向另一段故事</span>
        <h2 ref={headingRef} tabIndex={-1}>{prompt}</h2>
        <ChoiceList
          items={options}
          onChoose={onChoose}
          ariaLabel={prompt}
          className="demo-choices"
          itemClassName="demo-choice"
          renderItem={(option, index) => <>
            <span className="demo-choice-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span className="demo-choice-copy"><strong>{option.label}</strong>{option.description && <span>{option.description}</span>}</span>
            <span className="demo-choice-arrow" aria-hidden="true">↗</span>
          </>}
        />
      </div>
    </div>
  );
}
