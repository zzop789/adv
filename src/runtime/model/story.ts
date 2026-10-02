export interface NodeEffect {
  preset: 'none' | 'fade' | 'slide-up';
  durationMs: number;
}

interface NodePresentation { effect?: NodeEffect }

export interface VideoNode extends NodePresentation {
  id: string;
  type: 'video';
  mediaId: string;
  next: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  next: string;
}

export interface ChoiceNode extends NodePresentation {
  id: string;
  type: 'choice';
  prompt: string;
  options: ChoiceOption[];
}

export interface EndNode extends NodePresentation {
  id: string;
  type: 'end';
  title: string;
  description: string;
}

export type StoryNode = VideoNode | ChoiceNode | EndNode;
export interface StoryDefinition { schemaVersion: 1; nodes: StoryNode[] }
export interface StorySnapshot { node: StoryNode; visitId: number; runId: number }
export interface StoryActions {
  choose(optionId: string, visitId: number): void;
  restart(): void;
}
