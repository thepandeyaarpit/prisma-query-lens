import dagre from 'dagre';
import type { Node, Edge } from 'reactflow';
import type { AnalysisResult, FunctionNodeData, QueryNodeData } from '../types';
import { getOperationType } from './operationType';

const FN_W = 260;
const FN_H = 120;
const Q_W = 240;
const Q_H = 140;

/**
 * Build the full call chain graph for the entire analysis result.
 * Function nodes on the left column, query nodes fanning right from each function.
 * Uses dagre LR layout.
 */
export function buildFullGraph(
  result: AnalysisResult
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (result.callChain.length === 0 && result.queries.length === 0) {
    return { nodes, edges };
  }

  // Collect all function names
  const fnSet = new Set<string>(result.callChain);
  for (const q of result.queries) {
    if (q.calledFrom) fnSet.add(q.calledFrom);
  }
  const fnList = result.callChain.length > 0
    ? [...result.callChain, ...[...fnSet].filter(n => !result.callChain.includes(n))]
    : [...fnSet];

  // Build function nodes
  for (const fnName of fnList) {
    const directQueries = result.queries.filter(q => q.calledFrom === fnName);
    const isEntry = fnList[0] === fnName;
    const hasN1 = directQueries.some(q => q.isInLoop);

    const data: FunctionNodeData = {
      label: fnName,
      fileName: directQueries[0]?.filePath ?? '',
      queryCount: directQueries.length,
      isEntry,
      hasN1Warning: hasN1,
      isCollapsed: false,
      onToggleCollapse: () => {},
    };

    nodes.push({
      id: `fn-${fnName}`,
      type: 'functionNode',
      position: { x: 0, y: 0 },
      data,
    });
  }

  // Build function-to-function edges (consecutive callChain pairs)
  for (let i = 1; i < fnList.length; i++) {
    edges.push({
      id: `e-fn-${fnList[i - 1]}-${fnList[i]}`,
      source: `fn-${fnList[i - 1]}`,
      target: `fn-${fnList[i]}`,
      type: 'smoothstep',
      style: { stroke: 'rgba(102,126,234,0.35)', strokeWidth: 1.5 },
    });
  }

  // Build query nodes + function-to-query edges
  for (let i = 0; i < result.queries.length; i++) {
    const q = result.queries[i];
    const opType = getOperationType(q.method);

    const data: QueryNodeData = {
      query: q,
      operationType: opType,
      isHighlighted: false,
      isDimmed: false,
    };

    nodes.push({
      id: `q-${i}`,
      type: 'queryNode',
      position: { x: 0, y: 0 },
      data,
    });

    edges.push({
      id: `e-fn-${q.calledFrom}-q-${i}`,
      source: `fn-${q.calledFrom}`,
      target: `q-${i}`,
      type: 'smoothstep',
      style: { stroke: 'rgba(99,179,237,0.25)', strokeWidth: 1.5 },
    });
  }

  // Apply dagre layout
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 140, nodesep: 60, marginx: 40, marginy: 40 });

  for (const node of nodes) {
    const w = node.type === 'functionNode' ? FN_W : Q_W;
    const h = node.type === 'functionNode' ? FN_H : Q_H;
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  return {
    nodes: nodes.map(node => {
      const pos = g.node(node.id);
      if (!pos) return node;
      const w = node.type === 'functionNode' ? FN_W : Q_W;
      const h = node.type === 'functionNode' ? FN_H : Q_H;
      return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
    }),
    edges,
  };
}
