import { prepareStory } from '../story/prepare';
import { validateStory } from '../story/validate';
import type { SessionContent } from './types';

/** All potentially failing content checks happen before the live session is touched. */
export function prepareContent(candidate: SessionContent): SessionContent {
  if (!candidate || typeof candidate.entryNodeId !== 'string' || !candidate.mediaUrls || typeof candidate.mediaUrls !== 'object') {
    throw new Error('动态内容缺少入口节点或素材映射。');
  }
  const mediaUrls = Object.fromEntries(Object.entries(candidate.mediaUrls).filter(([, url]) => typeof url === 'string' && url.trim()));
  validateStory(candidate.story, candidate.entryNodeId, new Set(Object.keys(mediaUrls)));
  const mediaRevisions = candidate.mediaRevisions === undefined ? undefined : { ...candidate.mediaRevisions };
  if (mediaRevisions && Object.values(mediaRevisions).some((revision) => typeof revision !== 'string' || !revision.trim())) {
    throw new Error('素材版本必须是非空字符串。');
  }
  return Object.freeze({
    story: prepareStory(candidate.story), entryNodeId: candidate.entryNodeId,
    mediaUrls: Object.freeze(mediaUrls),
    mediaRevisions: mediaRevisions && Object.freeze(mediaRevisions),
  });
}
