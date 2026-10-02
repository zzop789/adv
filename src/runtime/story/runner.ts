import type { StoryDefinition, StoryNode, StorySnapshot } from '../model/story';
import { prepareStory } from './prepare';
import { validateStory } from './validate';

export interface RunnerPosition { nodeId?: string; visitId?: number; runId?: number }
type Listener = () => void;

/** Owns graph transitions; every operation carries the visit observed by its caller. */
export class StoryRunner {
  private readonly nodes: ReadonlyMap<string, StoryNode>;
  private readonly listeners = new Set<Listener>();
  private snapshot: StorySnapshot;

  constructor(story: StoryDefinition, private readonly entryNodeId: string, position: RunnerPosition = {}) {
    const parsed = prepareStory(story);
    validateStory(parsed, entryNodeId, new Set(parsed.nodes.flatMap((node) => node.type === 'video' ? [node.mediaId] : [])));
    this.nodes = new Map(parsed.nodes.map((node) => [node.id, node]));
    const node = this.nodes.get(position.nodeId ?? entryNodeId);
    if (!node) throw new Error(`剧情节点不存在：${position.nodeId}。`);
    const visitId = position.visitId ?? 1;
    const runId = position.runId ?? 1;
    if (![visitId, runId].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error('剧情访问代次不正确。');
    this.snapshot = Object.freeze({ node, visitId, runId });
  }

  readonly getSnapshot = (): StorySnapshot => this.snapshot;
  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  choose(optionId: string, expectedVisitId: number): boolean {
    const { node, visitId } = this.snapshot;
    if (visitId !== expectedVisitId || node.type !== 'choice') return false;
    const option = node.options.find((candidate) => candidate.id === optionId);
    if (!option) return false;
    this.transition(option.next);
    return true;
  }

  completeVideo(expectedVisitId: number): boolean {
    const { node, visitId } = this.snapshot;
    if (visitId !== expectedVisitId || node.type !== 'video') return false;
    this.transition(node.next);
    return true;
  }

  restart(): void { this.transition(this.entryNodeId, this.snapshot.runId + 1); }

  private transition(nodeId: string, runId = this.snapshot.runId): void {
    this.snapshot = Object.freeze({ node: this.nodes.get(nodeId)!, visitId: this.snapshot.visitId + 1, runId });
    for (const listener of [...this.listeners]) listener();
  }
}
