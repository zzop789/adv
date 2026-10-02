import { z } from 'zod';
import { storySchema } from '../../runtime/story-schema';
import type { StoryDefinition, StoryNode } from '../../runtime/types';
import type { ReadonlyStoryDefinition, ReadonlyStoryNode } from './types';

const nodeSchema = storySchema.shape.nodes.element;
// Empty and disconnected drafts are editable, but the runtime node shapes stay shared.
export const draftSchema = storySchema.extend({ nodes: z.array(nodeSchema) });

export function parseNode(input: StoryNode): StoryNode {
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

export function freezeNode(node: StoryNode): ReadonlyStoryNode {
  if (node.type === 'choice') {
    node.options.forEach(Object.freeze);
    Object.freeze(node.options);
  }
  if (node.effect) Object.freeze(node.effect);
  return Object.freeze(node);
}

export function freezeStory(nodes: readonly ReadonlyStoryNode[]): ReadonlyStoryDefinition {
  return Object.freeze({ schemaVersion: 1 as const, nodes: Object.freeze([...nodes]) });
}

export function copyNode(node: ReadonlyStoryNode): StoryNode {
  return structuredClone(node) as StoryNode;
}

export function equalNode(left: ReadonlyStoryNode, right: StoryNode): boolean {
  if (left.id !== right.id || left.type !== right.type) return false;
  if (left.effect?.preset !== right.effect?.preset || left.effect?.durationMs !== right.effect?.durationMs) return false;
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
