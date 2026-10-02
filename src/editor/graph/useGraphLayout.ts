import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { StoryDefinition } from '../../runtime/types';
import { clampPosition, defaultPosition, initialPositions, type Point } from './geometry';

interface DragPosition {
  id: string;
  clientX: number;
  clientY: number;
  point: Point;
}

/** Keeps the work's canvas positions, zoom and active pointer drag together. */
export function useGraphLayout(story: StoryDefinition, workId: string, onSelect: (id: string) => void) {
  const key = `adv-editor-layout:${workId}`;
  const [positions, setPositions] = useState(() => initialPositions(key));
  const [zoom, setZoom] = useState(1);
  const drag = useRef<DragPosition | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(positions));
    } catch {
      // The current session still keeps its layout.
    }
  }, [key, positions]);

  function position(id: string): Point {
    const index = story.nodes.findIndex((node) => node.id === id);
    return positions[id] ?? defaultPosition(index);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string): void {
    if (event.button !== 0) return;
    onSelect(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id,
      clientX: event.clientX,
      clientY: event.clientY,
      point: position(id),
    };
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>): void {
    const dragged = drag.current;
    if (!dragged) return;
    const x = clampPosition(dragged.point.x + (event.clientX - dragged.clientX) / zoom);
    const y = clampPosition(dragged.point.y + (event.clientY - dragged.clientY) / zoom);
    setPositions((previous) => ({ ...previous, [dragged.id]: { x, y } }));
  }

  function stopDrag(): void {
    drag.current = null;
  }

  const width = Math.max(1000, ...story.nodes.map((node) => position(node.id).x + 290));
  const height = Math.max(730, ...story.nodes.map((node) => position(node.id).y + 180));

  return {
    width,
    height,
    zoom,
    position,
    startDrag,
    moveDrag,
    stopDrag,
    zoomOut: () => setZoom((value) => Math.max(0.45, value - 0.1)),
    zoomIn: () => setZoom((value) => Math.min(1.6, value + 0.1)),
  };
}
