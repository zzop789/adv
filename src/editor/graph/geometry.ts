import type { StoryNode } from '../../runtime/types';

export interface Point {
  x: number;
  y: number;
}
export type Positions = Record<string, Point>;

export function clampPosition(value: number): number {
  return Math.max(0, Math.min(10000, value));
}

export function initialPositions(key: string): Positions {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}') as Positions;
    const entries = Object.entries(raw)
      .filter(([, point]) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      .map(([id, point]) => [id, { x: clampPosition(point.x), y: clampPosition(point.y) }]);
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function defaultPosition(index: number): Point {
  const safeIndex = Math.max(0, index);
  return {
    x: 45 + (safeIndex % 3) * 280,
    y: 45 + Math.floor(safeIndex / 3) * 180,
  };
}

export function nodeLinks(node: StoryNode) {
  if (node.type === 'video') return [{ target: node.next, label: '' }];
  if (node.type === 'choice') return node.options.map((option) => ({ target: option.next, label: option.label }));
  return [];
}
