import dagre from 'dagre';
import type { Node, Edge } from 'reactflow';

const FN_WIDTH = 240;
const FN_HEIGHT = 90;
const QUERY_WIDTH = 220;
const QUERY_HEIGHT = 110;

export function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  // LR = left-to-right: function chain flows left→right, queries branch downward from each fn
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 30, marginx: 40, marginy: 40 });

  for (const node of nodes) {
    const w = node.type === 'functionNode' ? FN_WIDTH : QUERY_WIDTH;
    const h = node.type === 'functionNode' ? FN_HEIGHT : QUERY_HEIGHT;
    g.setNode(node.id, { width: w, height: h });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map(node => {
    const pos = g.node(node.id);
    if (!pos) return node;
    const w = node.type === 'functionNode' ? FN_WIDTH : QUERY_WIDTH;
    const h = node.type === 'functionNode' ? FN_HEIGHT : QUERY_HEIGHT;
    return {
      ...node,
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
    };
  });
}
