import { storySchema, validateStory } from './story-schema';
import type { StoryDefinition, StoryNode, StorySnapshot } from './types';

type Listener = () => void;

/** The only owner of story transitions; callers must provide the visit they observed. */
export class StoryRunner {
  private readonly nodes: ReadonlyMap<string, StoryNode>;
  private readonly listeners = new Set<Listener>();
  private snapshot: StorySnapshot;

  constructor(story: StoryDefinition, private readonly entryNodeId: string) {
    const parsed = storySchema.parse(story);
    validateStory(parsed, entryNodeId, new Set(parsed.nodes.flatMap((node) => node.type === 'video' ? [node.mediaId] : [])));
    // Parsing copies authored data; freezing prevents an observing UI from editing the graph.
    for (const node of parsed.nodes) {
      if (node.type === 'choice') {
        node.options.forEach(Object.freeze);
        Object.freeze(node.options);
      }
      Object.freeze(node);
    }
    this.nodes = new Map(parsed.nodes.map((node) => [node.id, node]));
    this.snapshot = Object.freeze({ node: this.nodes.get(entryNodeId)!, visitId: 1, runId: 1 });
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

  restart(): void {
    this.transition(this.entryNodeId, this.snapshot.runId + 1);
  }

  private transition(nodeId: string, runId = this.snapshot.runId): void {
    // Replace before notifying so duplicate/reentrant input immediately becomes stale.
    this.snapshot = Object.freeze({
      node: this.nodes.get(nodeId)!,
      visitId: this.snapshot.visitId + 1,
      runId,
    });
    for (const listener of [...this.listeners]) listener();
  }
}
