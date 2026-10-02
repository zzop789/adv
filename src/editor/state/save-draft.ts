import type { AuthoringApi } from '../../authoring/contracts';
import type { DraftHistory } from './draft-history';

/** The saved baseline belongs to the submitted snapshot, even if editing continues. */
export async function saveDraft(api: Pick<AuthoringApi, 'save'>, history: DraftHistory, revision: string): Promise<string> {
  const submitted = history.getSnapshot().story;
  const result = await api.save({ story: submitted, expectedRevision: revision });
  if (!result.ok) throw new Error(result.error);
  history.markSaved(submitted);
  return result.value.revision;
}
