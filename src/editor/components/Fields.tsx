import type { ReactNode } from 'react';
import type { StoryDefinition } from '../../runtime/types';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="editor-field"><span>{label}</span>{children}</label>;
}
export function TargetSelect({ label, value, story, onChange }: { label: string; value: string; story: StoryDefinition; onChange(value: string): void }) {
  return <Field label={label}><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">未连接</option>
    {value && !story.nodes.some((node) => node.id === value) && <option value={value}>缺失：{value}</option>}
    {story.nodes.map((node) => <option key={node.id} value={node.id}>{node.id} · {node.type}</option>)}
  </select></Field>;
}
