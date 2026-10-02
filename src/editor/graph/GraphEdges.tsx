import type { StoryDefinition } from '../../runtime/types';
import { nodeLinks, type Point } from './geometry';

interface Props {
  story: StoryDefinition;
  width: number;
  height: number;
  position(id: string): Point;
}

export function GraphEdges({ story, width, height, position }: Props) {
  return (
    <svg className="editor-edges" width={width} height={height} aria-label="节点连线">
      <defs>
        <marker id="editor-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8Z" fill="#718ea5" />
        </marker>
      </defs>
      {story.nodes.flatMap((node) => nodeLinks(node).map((edge, index) => {
        if (!story.nodes.some((item) => item.id === edge.target)) return null;
        const from = position(node.id);
        const to = position(edge.target);
        const x1 = from.x + 225;
        const y1 = from.y + 52 + index * 13;
        const x2 = to.x;
        const y2 = to.y + 50;
        const bend = Math.max(65, Math.abs(x2 - x1) * 0.45);

        return (
          <g key={`${node.id}-${index}`}>
            <path
              d={`M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`}
              fill="none"
              stroke="#718ea5"
              strokeWidth="2"
              markerEnd="url(#editor-arrow)"
            />
            {edge.label && (
              <text x={x1 + 12} y={y1 - 8} fill="#a8b7c4" fontSize="10">
                {edge.label.slice(0, 12)}
              </text>
            )}
          </g>
        );
      }))}
    </svg>
  );
}
