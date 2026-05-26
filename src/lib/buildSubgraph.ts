import type { Node, Edge } from 'reactflow';
import type { AnalysisResult, FunctionNodeData, QueryNodeData } from '../types';
import { getOperationType } from './operationType';

const FN_W = 220;
const FN_H = 90;
const Q_W = 210;
const Q_H = 105;
const H_GAP = 120;
const V_GAP = 30;

/**
 * Build a small focused subgraph for a single function:
 * - The function node on the left
 * - Its direct query nodes fanned out to the right
 * Positions are computed manually (no dagre needed) for a clean layout.
 */
export function buildSubgraph(
  result: AnalysisResult,
  fnName: string,
  onQueryClick: (q: import('../types').QueryRecord) => void
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const queries = result.queries.filter(q => q.calledFrom === fnName);
  const isEntry = result.callChain[0] === fnName;
  const hasN1 = queries.some(q => q.isInLoop);

  // Function node — centered vertically
  const totalH = Math.max(1, queries.length) * (Q_H + V_GAP) - V_GAP;
  const fnY = totalH / 2 - FN_H / 2;

  const fnData: FunctionNodeData = {
    label: fnName,
    fileName: queries[0]?.filePath ?? '',
    queryCount: queries.length,
    isEntry,
    hasN1Warning: hasN1,
    isCollapsed: false,
    onToggleCollapse: () => {},
  };

  nodes.push({
    id: `fn-${fnName}`,
    type: 'functionNode',
    position: { x: 0, y: fnY },
    data: fnData,
  });

  // Query nodes — stacked vertically to the right
  queries.forEach((q, i) => {
    const opType = getOperationType(q.method);
    const qData: QueryNodeData = {
      query: q,
      operationType: opType,
      isHighlighted: false,
      isDimmed: false,
    };

    const nodeId = `q-${i}`;
    nodes.push({
      id: nodeId,
      type: 'queryNode',
      position: { x: FN_W + H_GAP, y: i * (Q_H + V_GAP) },
      data: qData,
    });

    edges.push({
      id: `e-fn-q-${i}`,
      source: `fn-${fnName}`,
      target: nodeId,
      type: 'smoothstep',
      animated: false,
      style: { stroke: 'rgba(99,179,237,0.3)', strokeWidth: 1.5 },
    });
  });

  // If no queries, show a placeholder message node
  if (queries.length === 0) {
    nodes.push({
      id: 'no-queries',
      type: 'default',
      position: { x: FN_W + H_GAP, y: fnY },
      data: { label: 'No Prisma queries' },
      style: {
        background: 'rgba(255,255,255,0.03)',
        border: '1px dashed rgba(255,255,255,0.1)',
        color: '#475569',
        fontSize: 12,
        borderRadius: 8,
        padding: '8px 16px',
      },
    });
  }

  return { nodes, edges };
}
