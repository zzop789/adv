import type { ReactNode } from 'react';
import { Button } from './Button';

export interface ChoiceItem {
  id: string;
  label: string;
  description?: string;
}

export interface ChoiceListProps {
  items: readonly ChoiceItem[];
  onChoose: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  itemClassName?: string;
  renderItem?: (item: ChoiceItem, index: number) => ReactNode;
}

export function ChoiceList({
  items, onChoose, ariaLabel = '选项', className = '', itemClassName = '', renderItem,
}: ChoiceListProps) {
  return <div className={`ui-choice-list ${className}`.trim()} role="group" aria-label={ariaLabel}>
    {items.map((item, index) => <Button
      key={item.id}
      className={`ui-choice ${itemClassName}`.trim()}
      aria-label={item.label}
      onClick={() => onChoose(item.id)}
    >
      {renderItem ? renderItem(item, index) : <>
        <span className="ui-choice__label">{item.label}</span>
        {item.description && <span className="ui-choice__description">{item.description}</span>}
      </>}
    </Button>)}
  </div>;
}
