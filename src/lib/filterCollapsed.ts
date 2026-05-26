import type { Node, Edge } from 'reactflow';

export function filterCollapsedNodes(
  nodes: Node[],
  edges: Edge[],
  collapsedIds: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  if (collapsedIds.size === 0) return { nodes, edges };

  // Find all descendants of collapsed nodes via BFS
  const hiddenIds = new Set<string>();

  for (const collapsedId of collapsedIds) {
    const queue = [collapsedId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      // Find all direct children
      for (const edge of edges) {
        if (edge.source === current && !hiddenIds.has(edge.target)) {
          hiddenIds.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
  }

  const visibleNodes = nodes.filter(n => !hiddenIds.has(n.id));
  const visibleEdges = edges.filter(
    e => !hiddenIds.has(e.source) && !hiddenIds.has(e.target)
  );

  return { nodes: visibleNodes, edges: visibleEdges };
}
