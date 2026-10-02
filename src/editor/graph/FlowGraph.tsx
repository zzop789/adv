import type { StoryDefinition } from '../../runtime/types';
import { GraphEdges } from './GraphEdges';
import { GraphNode } from './GraphNode';
import { useGraphLayout } from './useGraphLayout';

interface Props {
  story: StoryDefinition;
  entryNodeId: string;
  selectedId: string | null;
  onSelect(id: string): void;
  workId: string;
}

export default function FlowGraph({ story, entryNodeId, selectedId, onSelect, workId }: Props) {
  const layout = useGraphLayout(story, workId, onSelect);
  const { width, height, zoom } = layout;

  return (
    <section className="editor-graph-area" aria-label="剧情流程图">
      <div className="editor-graph-toolbar">
        <span>拖动节点排版 · 下拉目标连线 · 滚动查看画布</span>
        <button aria-label="缩小画布" onClick={layout.zoomOut}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button aria-label="放大画布" onClick={layout.zoomIn}>＋</button>
      </div>
      <div className="editor-graph-scroll">
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div
            className="editor-graph-canvas"
            style={{ width, height, transform: `scale(${zoom})` }}
          >
            <GraphEdges story={story} width={width} height={height} position={layout.position} />
            {story.nodes.map((node) => (
              <GraphNode
                key={node.id}
                node={node}
                position={layout.position(node.id)}
                selected={selectedId === node.id}
                entry={node.id === entryNodeId}
                onSelect={onSelect}
                onDragStart={layout.startDrag}
                onDragMove={layout.moveDrag}
                onDragStop={layout.stopDrag}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
