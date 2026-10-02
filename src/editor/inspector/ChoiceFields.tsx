import type { ChoiceNode, StoryDefinition } from '../../runtime/types';
import { Field, TargetSelect } from '../components/Fields';

interface Props {
  node: ChoiceNode;
  story: StoryDefinition;
  onChange(node: ChoiceNode): void;
}

export default function ChoiceFields({ node, story, onChange }: Props) {
  const edit = (index: number, patch: Partial<ChoiceNode['options'][number]>) => {
    onChange({
      ...node,
      options: node.options.map((option, itemIndex) => itemIndex === index ? { ...option, ...patch } : option),
    });
  };
  const add = () => {
    let index = 1;
    while (node.options.some((option) => option.id === `option_${index}`)) index += 1;
    onChange({ ...node, options: [...node.options, { id: `option_${index}`, label: '新选项', next: '' }] });
  };
  return <>
    <Field label="选择提示">
      <textarea aria-label="选择提示" value={node.prompt} onChange={(event) => onChange({ ...node, prompt: event.target.value })} />
    </Field>
    {node.options.map((option, index) => <fieldset className="editor-option" key={index}>
      <legend>选项 {index + 1}</legend>
      <Field label={`选项 ${index + 1} ID`}>
        <input aria-label={`选项 ${index + 1} ID`} value={option.id} onChange={(event) => edit(index, { id: event.target.value })} />
      </Field>
      <Field label={`选项 ${index + 1} 文案`}>
        <input aria-label={`选项 ${index + 1} 文案`} value={option.label} onChange={(event) => edit(index, { label: event.target.value })} />
      </Field>
      <Field label={`选项 ${index + 1} 描述`}>
        <input aria-label={`选项 ${index + 1} 描述`} value={option.description ?? ''} onChange={(event) => edit(index, { description: event.target.value })} />
      </Field>
      <TargetSelect label={`选项 ${index + 1} 目标`} value={option.next} story={story} onChange={(next) => edit(index, { next })} />
      <button onClick={() => onChange({ ...node, options: node.options.filter((_, i) => i !== index) })}>删除选项 {index + 1}</button>
    </fieldset>)}
    <button onClick={add}>添加选项</button>
  </>;
}
