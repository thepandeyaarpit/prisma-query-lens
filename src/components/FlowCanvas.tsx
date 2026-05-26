import { useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
} from 'reactflow';
import type { Node, Edge, NodeMouseHandler } from 'reactflow';
import 'reactflow/dist/style.css';
import { FunctionNode } from './nodes/FunctionNode';
import { QueryNode } from './nodes/QueryNode';

const nodeTypes = {
  functionNode: FunctionNode,
  queryNode: QueryNode,
};

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodeClick: NodeMouseHandler;
  // Pass a stable key that only changes when the graph structure changes (new analysis)
  graphKey?: string;
  selectedNodeId?: string | null;
}

function FlowCanvasInner({ nodes, edges, onNodeClick, graphKey, selectedNodeId }: Props) {
  const { fitView } = useReactFlow();
  const prevGraphKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Only fitView when the graph structure changes (new analysis loaded)
    // NOT when just highlight/style changes happen
    if (nodes.length > 0 && graphKey !== prevGraphKey.current) {
      prevGraphKey.current = graphKey;
      setTimeout(() => fitView({ padding: 0.12, duration: 400 }), 80);
    }
  }, [graphKey, nodes.length, fitView]);

  useEffect(() => {
    if (selectedNodeId && nodes.length > 0) {
      // Focus on the selected node
      // We use a larger padding or offset if it's a query node (since DetailPanel opens)
      const isQuery = selectedNodeId.startsWith('q-');
      fitView({
        nodes: [{ id: selectedNodeId }],
        padding: isQuery ? 1.5 : 0.8, // More padding for queries to stay clear of the panel
        duration: 500,
      });
    }
  }, [selectedNodeId, nodes.length, fitView]);

  if (nodes.length === 0) {
    return (
      <div className="canvas-empty">
        <div className="canvas-empty-icon">🔍</div>
        <p>Enter a function name and file path above, then click Analyze</p>
        <span className="canvas-empty-hint">The full execution flow will appear here as an interactive graph</span>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      minZoom={0.05}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
    >
      <Background variant={BackgroundVariant.Dots} color="#1e2a3a" gap={24} size={1.5} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={n => {
          if (n.type === 'functionNode') return '#667eea';
          const op = (n.data as { operationType?: string }).operationType;
          if (op === 'read') return '#4fd1c5';
          if (op === 'write') return '#68d391';
          if (op === 'update') return '#f6e05e';
          if (op === 'delete') return '#fc8181';
          if (op === 'raw') return '#f687b3';
          return '#475569';
        }}
        maskColor="rgba(10,14,26,0.7)"
        style={{ background: 'rgba(15,22,41,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
      />
    </ReactFlow>
  );
}

export function FlowCanvas(props: Props) {
  const handleNodeClick = useCallback<NodeMouseHandler>(
    (event, node) => props.onNodeClick(event, node),
    [props]
  );
  return <FlowCanvasInner {...props} onNodeClick={handleNodeClick} />;
}
