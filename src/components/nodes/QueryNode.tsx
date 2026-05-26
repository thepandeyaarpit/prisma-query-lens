import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { QueryNodeData } from '../../types';

export function QueryNode({ data }: NodeProps<QueryNodeData>) {
  const { query, operationType, isHighlighted, isDimmed } = data;

  return (
    <div
      className={`query-node query-node-${operationType}${isHighlighted ? ' highlighted' : ''}${isDimmed ? ' dimmed' : ''}`}
    >
      {/* Incoming from left (from function node) */}
      <Handle type="target" position={Position.Left} />

      <div className="query-node-header">
        <span className={`method-badge method-${operationType}`}>
          {query.method}
        </span>
        {query.isInLoop && <span className="n1-badge">⚡ N+1</span>}
        {query.callDepth > 0 && (
          <span className="depth-badge">d{query.callDepth}</span>
        )}
      </div>
      <div className="query-node-model">{query.model}</div>
      <div className="query-node-meta">
        <span title={query.filePath}>{query.filePath}</span>
        <span>:{query.line}</span>
      </div>
    </div>
  );
}
