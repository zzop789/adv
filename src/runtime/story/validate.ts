import type { StoryDefinition, StoryNode } from '../model/story';
import { storySchema } from './schema';

function successors(node: StoryNode): string[] {
  if (node.type === 'video') return [node.next];
  if (node.type === 'choice') return node.options.map((option) => option.next);
  return [];
}

/** Validate references and graph structure before starting or packaging a game. */
export function validateStory(story: StoryDefinition, entryNodeId: string, mediaIds: ReadonlySet<string>): void {
  const parsed = storySchema.safeParse(story);
  if (!parsed.success) throw new Error('story.json 配置不正确，请检查节点格式和 schemaVersion。');
  const nodes = new Map<string, StoryNode>();
  for (const node of parsed.data.nodes) {
    if (nodes.has(node.id)) throw new Error(`剧情节点 ID 重复：${node.id}。`);
    nodes.set(node.id, node);
    if (node.type === 'video' && !mediaIds.has(node.mediaId)) {
      throw new Error(`剧情节点 ${node.id} 引用了不存在的视频素材 ${node.mediaId}。`);
    }
    if (node.type === 'choice') {
      const optionIds = new Set<string>();
      for (const option of node.options) {
        if (optionIds.has(option.id)) throw new Error(`选择节点 ${node.id} 的选项 ID 重复：${option.id}。`);
        optionIds.add(option.id);
      }
    }
  }
  if (!nodes.has(entryNodeId)) throw new Error(`入口剧情节点不存在：${entryNodeId}。`);
  const predecessors = new Map<string, string[]>();
  for (const node of nodes.values()) {
    for (const next of successors(node)) {
      if (!nodes.has(next)) throw new Error(`剧情节点 ${node.id} 跳转到了不存在的节点 ${next}。`);
      const parents = predecessors.get(next) ?? [];
      parents.push(node.id);
      predecessors.set(next, parents);
    }
  }
  const reachable = new Set<string>();
  const pending = [entryNodeId];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    pending.push(...successors(nodes.get(current)!));
  }
  const unreachable = [...nodes.keys()].filter((nodeId) => !reachable.has(nodeId));
  if (unreachable.length > 0) throw new Error(`存在入口无法到达的剧情节点：${unreachable.join('、')}。`);
  const endings = [...nodes.values()].filter((node) => node.type === 'end').map((node) => node.id);
  if (endings.length === 0) throw new Error('剧情必须至少包含一个 end 结局节点。');
  const canEnd = new Set<string>();
  const reversePending = [...endings];
  while (reversePending.length > 0) {
    const current = reversePending.pop()!;
    if (canEnd.has(current)) continue;
    canEnd.add(current);
    reversePending.push(...(predecessors.get(current) ?? []));
  }
  const trapped = [...nodes.keys()].filter((nodeId) => !canEnd.has(nodeId));
  if (trapped.length > 0) throw new Error(`以下剧情节点无法到达任何结局：${trapped.join('、')}。`);
}
