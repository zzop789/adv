import type { StoryDefinition } from '../model/story';
import { storySchema } from './schema';

/** Parse into an isolated graph; observers cannot edit it through a story snapshot. */
export function prepareStory(input: StoryDefinition): StoryDefinition {
  const story = storySchema.parse(input);
  for (const node of story.nodes) {
    if (node.effect) Object.freeze(node.effect);
    if (node.type === 'choice') {
      node.options.forEach(Object.freeze);
      Object.freeze(node.options);
    }
    Object.freeze(node);
  }
  Object.freeze(story.nodes);
  return Object.freeze(story);
}
