import { useEffect, useRef } from 'react';
import type { ChoiceScreenProps } from '../../../../src/ui/contracts';
import { ChoiceList } from '../../../../src/ui-base';
import '../styles.css';

export default function ChoiceScreen({ prompt, options, onChoose }: ChoiceScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [prompt, options]);
  return (
    <div className="afterglow-letter-body">
      <p className="afterglow-letter-kicker">现在，轮到你落笔</p>
      <h2 ref={headingRef} tabIndex={-1}>{prompt}</h2>
      <ChoiceList
        items={options}
        onChoose={onChoose}
        ariaLabel={prompt}
        className="afterglow-choices"
        itemClassName="afterglow-choice"
        renderItem={(option, index) => <>
          <span className="afterglow-choice-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <span className="afterglow-choice-content"><strong>{option.label}</strong>{option.description && <span>{option.description}</span>}</span>
          <span className="afterglow-choice-arrow" aria-hidden="true">→</span>
        </>}
      />
      <p className="afterglow-letter-footnote">不必急着回答，故事愿意等你。</p>
    </div>
  );
}
