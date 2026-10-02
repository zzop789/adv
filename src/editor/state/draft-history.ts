import type { StoryDefinition, StoryNode } from '../../runtime/types';

export interface DraftSnapshot {
  story: StoryDefinition;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}
const serialize = (story: StoryDefinition) => JSON.stringify(story);
function copy(story: StoryDefinition): StoryDefinition { return structuredClone(story); }

/** UI drafts allow incomplete links and text; disk writes always use authoring validation. */
export class DraftHistory {
  private past: StoryDefinition[] = [];
  private future: StoryDefinition[] = [];
  private baseline: string;
  private snapshot: DraftSnapshot;
  private listeners = new Set<() => void>();
  constructor(story: StoryDefinition) {
    this.baseline = serialize(story);
    this.snapshot = { story: copy(story), dirty: false, canUndo: false, canRedo: false };
  }
  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  edit(change: (story: StoryDefinition) => void): void {
    const next = copy(this.snapshot.story);
    change(next);
    if (serialize(next) === serialize(this.snapshot.story)) return;
    this.past.push(this.snapshot.story);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.publish(next);
  }
  update(node: StoryNode): void {
    this.edit((story) => {
      story.nodes = story.nodes.map((item) => item.id === node.id ? structuredClone(node) : item);
    });
  }
  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.snapshot.story);
    this.publish(previous);
  }
  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.snapshot.story);
    this.publish(next);
  }
  markSaved(submitted: StoryDefinition = this.snapshot.story): void {
    this.baseline = serialize(submitted);
    this.publish(this.snapshot.story);
  }
  replace(story: StoryDefinition): void {
    this.past = [];
    this.future = [];
    this.baseline = serialize(story);
    this.publish(copy(story));
  }
  private publish(story: StoryDefinition): void {
    this.snapshot = { story, dirty: serialize(story) !== this.baseline, canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
    for (const listener of this.listeners) listener();
  }
}

export function newNode(type: StoryNode['type'], story: StoryDefinition, mediaIds: string[], entry: string): StoryNode {
  let index = 1;
  while (story.nodes.some((node) => node.id === `${type}_${index}`)) index += 1;
  const id = `${type}_${index}`;
  if (type === 'video') return { id, type, mediaId: mediaIds[0] ?? '', next: entry };
  if (type === 'choice') return { id, type, prompt: '请选择接下来的方向', options: [{ id: 'option_1', label: '继续', next: entry }] };
  return { id, type, title: '新的结局', description: '在这里写下结局。' };
}
