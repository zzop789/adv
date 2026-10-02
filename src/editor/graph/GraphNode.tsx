import type { PointerEvent } from 'react';
import type { StoryNode } from '../../runtime/types';
import type { Point } from './geometry';

interface Props {
  node: StoryNode;
  position: Point;
  selected: boolean;
  entry: boolean;
  onSelect(id: string): void;
  onDragStart(event: PointerEvent<HTMLButtonElement>, id: string): void;
  onDragMove(event: PointerEvent<HTMLButtonElement>): void;
  onDragStop(): void;
}

const nodeTypeLabels = { video: '视频', choice: '选择', end: '结局' };

export function GraphNode({ node, position, selected, entry, onSelect, onDragStart, onDragMove, onDragStop }: Props) {
  const description = node.type === 'video' ? node.mediaId
    : node.type === 'choice' ? node.prompt : node.title;
  const className = `editor-node editor-node--${node.type}${selected ? ' is-selected' : ''}`;

  return (
    <button
      type="button"
      aria-label={`选择节点 ${node.id}`}
      aria-pressed={selected}
      className={className}
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => onDragStart(event, node.id)}
      onPointerMove={onDragMove}
      onPointerUp={onDragStop}
      onPointerCancel={onDragStop}
      onClick={() => onSelect(node.id)}
    >
      <span className="editor-node-type">
        {nodeTypeLabels[node.type]} {entry && ' · 入口'}
      </span>
      <strong>{node.id}</strong>
      <span className="editor-node-copy">{description}</span>
      {node.effect && node.effect.preset !== 'none' && (
        <small>动效 · {node.effect.preset}</small>
      )}
    </button>
  );
}
