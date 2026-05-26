import type { Node, Edge } from 'reactflow';
import type { AnalysisResult, FunctionNodeData, QueryNodeData } from '../types';
import { getOperationType } from './operationType';

export function transformToGraph(result: AnalysisResult): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (result.callChain.length === 0 && result.queries.length === 0) {
    return { nodes, edges };
  }

  // Collect all function names — from callChain + any orphan calledFrom values
  const fnNames = new Set<string>(result.callChain);
  for (const q of result.queries) {
    if (q.calledFrom) fnNames.add(q.calledFrom);
  }

  const fnList = result.callChain.length > 0
    ? [...result.callChain, ...[...fnNames].filter(n => !result.callChain.includes(n))]
    : [...fnNames];

  // Build function nodes
  for (const fnName of fnList) {
    const directQueries = result.queries.filter(q => q.calledFrom === fnName);
    const fileName = directQueries.length > 0 ? directQueries[0].filePath : '';
    const hasN1Warning = directQueries.some(q => q.isInLoop);
    const isEntry = fnList[0] === fnName;

    const data: FunctionNodeData = {
      label: fnName,
      fileName,
      queryCount: directQueries.length,
      isEntry,
      hasN1Warning,
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

  // Build function-to-function edges using callChain order + callDepth
  // Strategy: for each function in callChain (after the first), find its parent
  // by looking for the function whose queries have callDepth = (this fn's min depth - 1)
  // Fallback: connect consecutive callChain entries
  const fnDepthMap = new Map<string, number>();
  for (const q of result.queries) {
    const existing = fnDepthMap.get(q.calledFrom);
    if (existing === undefined || q.callDepth < existing) {
      fnDepthMap.set(q.calledFrom, q.callDepth);
    }
  }

  // Connect function nodes: parent is the fn with depth = myDepth - 1
  for (let i = 1; i < fnList.length; i++) {
    const child = fnList[i];
    const childDepth = fnDepthMap.get(child) ?? i;
    const parentDepth = childDepth - 1;

    // Find parent: fn with depth === parentDepth
    let parent = fnList[i - 1]; // fallback
    for (const [fn, depth] of fnDepthMap.entries()) {
      if (depth === parentDepth && fnList.includes(fn)) {
        parent = fn;
        break;
      }
    }

    edges.push({
      id: `e-fn-${parent}-${child}`,
      source: `fn-${parent}`,
      target: `fn-${child}`,
      type: 'smoothstep',
      animated: false,
    });
  }

  // Build query nodes + function-to-query edges
  for (let i = 0; i < result.queries.length; i++) {
    const q = result.queries[i];
    const operationType = getOperationType(q.method);

    const data: QueryNodeData = {
      query: q,
      operationType,
      isHighlighted: false,
      isDimmed: false,
    };

    nodes.push({
      id: `q-${i}`,
      type: 'queryNode',
      position: { x: 0, y: 0 },
      data,
    });

    const sourceId = `fn-${q.calledFrom}`;
    edges.push({
      id: `e-${sourceId}-q-${i}`,
      source: sourceId,
      target: `q-${i}`,
      type: 'smoothstep',
      animated: false,
    });
  }

  return { nodes, edges };
}
