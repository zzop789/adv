import { z } from 'zod';
import { storySchema, validateStory } from '../runtime/story-schema';
import type { ChoiceOption, StoryDefinition, StoryNode } from '../runtime/types';

export type ReadonlyStoryNode = StoryNode extends infer Node
  ? Node extends { type: 'choice'; options: ChoiceOption[] }
    ? Readonly<Omit<Node, 'options'>> & { readonly options: readonly Readonly<ChoiceOption>[] }
    : Readonly<Node>
  : never;

export interface ReadonlyStoryDefinition {
  readonly schemaVersion: 1;
  readonly nodes: readonly ReadonlyStoryNode[];
}

export interface StoryDocument {
  story: StoryDefinition;
  entryNodeId: string;
}

export interface StoryEditorSnapshot {
  readonly story: ReadonlyStoryDefinition;
  readonly entryNodeId: string;
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type StoryValidationResult = { ok: true } | { ok: false; error: string };

interface EditorState {
  readonly story: ReadonlyStoryDefinition;
  readonly entryNodeId: string;
}

type Listener = () => void;
const nodeSchema = storySchema.shape.nodes.element;
// Empty and disconnected drafts are editable, but the runtime node shapes stay shared.
const draftSchema = storySchema.extend({ nodes: z.array(nodeSchema) });

function parseNode(input: StoryNode): StoryNode {
  const result = nodeSchema.safeParse(input);
  if (!result.success) throw new Error('剧情节点格式不正确，请检查节点类型、ID 和必需字段。');
  const node = result.data;
  if (node.type === 'choice') {
    const ids = new Set<string>();
    for (const option of node.options) {
      if (ids.has(option.id)) throw new Error(`选择节点 ${node.id} 的选项 ID 重复：${option.id}。`);
      ids.add(option.id);
    }
  }
  return node;
}

function freezeNode(node: StoryNode): ReadonlyStoryNode {
  if (node.type === 'choice') {
    node.options.forEach(Object.freeze);
    Object.freeze(node.options);
  }
  return Object.freeze(node);
}

function freezeStory(nodes: readonly ReadonlyStoryNode[]): ReadonlyStoryDefinition {
  return Object.freeze({ schemaVersion: 1 as const, nodes: Object.freeze([...nodes]) });
}

function copyNode(node: ReadonlyStoryNode): StoryNode {
  return node.type === 'choice'
    ? { ...node, options: node.options.map((option) => ({ ...option })) }
    : { ...node };
}

function equalNode(left: ReadonlyStoryNode, right: StoryNode): boolean {
  if (left.id !== right.id || left.type !== right.type) return false;
  if (left.type === 'video' && right.type === 'video') return left.mediaId === right.mediaId && left.next === right.next;
  if (left.type === 'end' && right.type === 'end') return left.title === right.title && left.description === right.description;
  if (left.type === 'choice' && right.type === 'choice') {
    return left.prompt === right.prompt && left.options.length === right.options.length && left.options.every((option, index) => {
      const other = right.options[index];
      return option.id === other.id && option.label === other.label && option.description === other.description && option.next === other.next;
    });
  }
  return false;
}

/** Pure authoring model. Local edits may break graph references until validate() succeeds. */
export class StoryEditor {
  private snapshot: StoryEditorSnapshot;
  private readonly past: EditorState[] = [];
  private readonly future: EditorState[] = [];
  private readonly listeners = new Set<Listener>();
  private notifying = false;
  private notificationPending = false;

  constructor(story: StoryDefinition, entryNodeId: string) {
    const parsed = draftSchema.safeParse(story);
    if (!parsed.success) throw new Error('剧情草稿格式不正确，请检查 schemaVersion 和 nodes。');
    if (typeof entryNodeId !== 'string') throw new Error('入口节点 ID 必须是字符串。');
    const ids = new Set<string>();
    const nodes = parsed.data.nodes.map((input) => {
      const node = parseNode(input);
      if (ids.has(node.id)) throw new Error(`剧情节点 ID 重复：${node.id}。`);
      ids.add(node.id);
      return freezeNode(node);
    });
    this.snapshot = Object.freeze({ story: freezeStory(nodes), entryNodeId, revision: 0, canUndo: false, canRedo: false });
  }

  readonly getSnapshot = (): StoryEditorSnapshot => this.snapshot;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  addNode(input: StoryNode): boolean {
    const node = parseNode(input);
    if (this.snapshot.story.nodes.some((candidate) => candidate.id === node.id)) {
      throw new Error(`剧情节点 ID 重复：${node.id}。`);
    }
    return this.edit(freezeStory([...this.snapshot.story.nodes, freezeNode(node)]), this.snapshot.entryNodeId);
  }

  /** Replaces the full node at the same ID; changing its type is an explicit edit. */
  updateNode(input: StoryNode): boolean {
    const node = parseNode(input);
    const previous = this.requireNode(node.id);
    if (equalNode(previous, node)) return false;
    const replacement = freezeNode(node);
    return this.edit(freezeStory(this.snapshot.story.nodes.map((candidate) => candidate.id === node.id ? replacement : candidate)), this.snapshot.entryNodeId);
  }

  /** Incoming links and entryNodeId intentionally remain unchanged for the author to repair. */
  removeNode(id: string): boolean {
    this.requireNode(id);
    return this.edit(freezeStory(this.snapshot.story.nodes.filter((node) => node.id !== id)), this.snapshot.entryNodeId);
  }

  connect(fromId: string, targetId: string, optionId?: string): boolean {
    const node = this.requireNode(fromId);
    this.requireNode(targetId);
    if (node.type === 'video') {
      if (optionId !== undefined) throw new Error('视频节点连接不能指定 optionId。');
      return this.updateNode({ ...node, next: targetId });
    }
    if (node.type === 'choice') {
      if (optionId === undefined || !node.options.some((option) => option.id === optionId)) {
        throw new Error(`选择节点 ${fromId} 必须指定一个已存在的选项 ID。`);
      }
      return this.updateNode({
        ...node,
        options: node.options.map((option) => ({ ...option, ...(option.id === optionId ? { next: targetId } : {}) })),
      });
    }
    throw new Error('结局节点不能设置后续连接。');
  }

  setEntry(nodeId: string): boolean {
    this.requireNode(nodeId);
    if (nodeId === this.snapshot.entryNodeId) return false;
    return this.edit(this.snapshot.story, nodeId);
  }

  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.currentState());
    this.publish(previous);
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.currentState());
    this.publish(next);
    return true;
  }

  validate(mediaIds: ReadonlySet<string>): StoryValidationResult {
    try {
      const document = this.export();
      validateStory(document.story, document.entryNodeId, mediaIds);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '剧情校验失败。' };
    }
  }

  /** Returns a detached, writable document for file storage or preview. */
  export(): StoryDocument {
    return {
      story: { schemaVersion: 1, nodes: this.snapshot.story.nodes.map(copyNode) },
      entryNodeId: this.snapshot.entryNodeId,
    };
  }

  private requireNode(id: string): ReadonlyStoryNode {
    const node = this.snapshot.story.nodes.find((candidate) => candidate.id === id);
    if (!node) throw new Error(`剧情节点不存在：${id}。`);
    return node;
  }

  private currentState(): EditorState {
    return { story: this.snapshot.story, entryNodeId: this.snapshot.entryNodeId };
  }

  private edit(story: ReadonlyStoryDefinition, entryNodeId: string): boolean {
    this.past.push(this.currentState());
    this.future.length = 0;
    this.publish({ story, entryNodeId });
    return true;
  }

  private publish(state: EditorState): void {
    this.snapshot = Object.freeze({
      ...state,
      revision: this.snapshot.revision + 1,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    });
    this.notify();
  }

  private notify(): void {
    this.notificationPending = true;
    if (this.notifying) return;
    this.notifying = true;
    const errors: unknown[] = [];
    try {
      while (this.notificationPending) {
        this.notificationPending = false;
        for (const listener of [...this.listeners]) {
          if (!this.listeners.has(listener)) continue;
          try { listener(); } catch (error) { errors.push(error); }
        }
      }
    } finally {
      this.notifying = false;
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, '剧情编辑状态通知失败。');
  }
}
