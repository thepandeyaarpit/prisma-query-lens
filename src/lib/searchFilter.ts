import type { Node } from 'reactflow';
import type { OperationType, FunctionNodeData, QueryNodeData } from '../types';

export function applySearchAndFilter(
  nodes: Node[],
  searchQuery: string,
  activeFilters: Set<OperationType>
): Node[] {
  const q = searchQuery.toLowerCase().trim();

  return nodes
    .filter(node => {
      // Exclude query nodes whose operation type is filtered out
      if (node.type === 'queryNode') {
        const data = node.data as QueryNodeData;
        if (!activeFilters.has(data.operationType)) return false;
      }
      return true;
    })
    .map(node => {
      if (!q) {
        // No search — clear highlight/dim
        if (node.type === 'queryNode') {
          return { ...node, data: { ...node.data, isHighlighted: false, isDimmed: false } };
        }
        return node;
      }

      let matches = false;
      if (node.type === 'functionNode') {
        const data = node.data as FunctionNodeData;
        matches = data.label.toLowerCase().includes(q);
      } else if (node.type === 'queryNode') {
        const data = node.data as QueryNodeData;
        matches =
          data.query.model.toLowerCase().includes(q) ||
          data.query.method.toLowerCase().includes(q) ||
          data.query.calledFrom.toLowerCase().includes(q);
      }

      if (node.type === 'queryNode') {
        return {
          ...node,
          data: { ...node.data, isHighlighted: matches, isDimmed: !matches },
        };
      }
      return node;
    });
}
