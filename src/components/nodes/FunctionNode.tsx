import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { FunctionNodeData } from '../../types';

export function FunctionNode({ data }: NodeProps<FunctionNodeData>) {
  return (
    <div className={`fn-node${data.isEntry ? ' fn-node-entry' : ''}`}>
      {/* Incoming from left */}
      <Handle type="target" position={Position.Left} />

      <div className="fn-node-accent-bar" />
      <div className="fn-node-body">
        <div className="fn-node-header">
          <div className="fn-node-icon-wrap">
            {data.isEntry ? '⚡' : 'ƒ'}
          </div>
          <span className="fn-node-name" title={data.label}>{data.label}</span>
          {data.hasN1Warning && (
            <span className="fn-node-n1">⚠ N+1</span>
          )}
          <button
            className="fn-node-collapse"
            onClick={e => { e.stopPropagation(); data.onToggleCollapse(); }}
            title={data.isCollapsed ? 'Expand' : 'Collapse'}
          >
            <span className={`fn-node-collapse-icon${data.isCollapsed ? ' collapsed' : ''}`}>
              {data.isCollapsed ? '▶' : '▼'}
            </span>
          </button>
        </div>
        {data.fileName && (
          <div className="fn-node-file">
            <span>📄</span>
            <span title={data.fileName}>{data.fileName}</span>
          </div>
        )}
        <div className="fn-node-count">
          {data.queryCount} {data.queryCount === 1 ? 'query' : 'queries'}
        </div>
      </div>

      {/* Outgoing to right */}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
