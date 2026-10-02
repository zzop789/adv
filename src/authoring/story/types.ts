import type { ChoiceOption, NodeEffect, StoryDefinition, StoryNode } from '../../runtime/types';

type ReadonlyEffect = { readonly effect?: Readonly<NodeEffect> };

export type ReadonlyStoryNode = StoryNode extends infer Node
  ? Node extends { type: 'choice'; options: ChoiceOption[] }
    ? Readonly<Omit<Node, 'options' | 'effect'>> & ReadonlyEffect & { readonly options: readonly Readonly<ChoiceOption>[] }
    : Readonly<Omit<Node, 'effect'>> & ReadonlyEffect
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

export interface EditorState {
  readonly story: ReadonlyStoryDefinition;
  readonly entryNodeId: string;
}
