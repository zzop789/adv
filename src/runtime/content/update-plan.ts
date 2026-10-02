import type { StorySnapshot } from '../model/story';
import { StoryRunner } from '../story/runner';
import { prepareContent } from './prepare';
import type { ContentUpdateOptions, SessionContent } from './types';

export interface ContentUpdatePlan { content: SessionContent; runner: StoryRunner; preserve: boolean }

export function planContentUpdate(
  candidate: SessionContent, options: ContentUpdateOptions, current: SessionContent, position: StorySnapshot,
): ContentUpdatePlan {
  if (!options || !['restart', 'replay-node', 'preserve'].includes(options.strategy)) throw new Error('动态更新策略不正确。');
  if (options.nodeId !== undefined && options.strategy !== 'replay-node') throw new Error('只有 replay-node 策略可以指定 nodeId。');
  const content = prepareContent(candidate);
  const nodeId = options.strategy === 'restart' ? content.entryNodeId : options.nodeId ?? position.node.id;
  const nextNode = content.story.nodes.find((node) => node.id === nodeId);
  if (!nextNode) throw new Error(`新内容中没有要预览的节点：${nodeId}。`);
  const preserve = options.strategy === 'preserve';
  if (preserve) {
    if (nextNode.type !== position.node.type) throw new Error('保留播放状态要求当前节点类型不变。');
    if (nextNode.type === 'video' && position.node.type === 'video') {
      if (nextNode.mediaId !== position.node.mediaId) throw new Error('当前视频素材 ID 已变化，请重新播放节点。');
      const id = nextNode.mediaId;
      const before = current.mediaRevisions?.[id];
      const after = content.mediaRevisions?.[id];
      const sameMedia = before !== undefined && after !== undefined
        ? before === after : current.mediaUrls[id] === content.mediaUrls[id];
      if (!sameMedia) throw new Error('当前视频文件已变化或无法确认一致，请重新播放节点。');
    }
  }
  const runner = new StoryRunner(content.story, content.entryNodeId, {
    nodeId, visitId: position.visitId + 1, runId: position.runId + (options.strategy === 'restart' ? 1 : 0),
  });
  return { content, runner, preserve };
}
