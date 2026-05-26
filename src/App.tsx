import { useState, useMemo, useCallback, useEffect } from 'react';
import { ReactFlowProvider } from 'reactflow';
import type { NodeMouseHandler } from 'reactflow';
import type { AnalysisResult, AnalyzeParams, QueryRecord, QueryNodeData, FunctionNodeData } from './types';
import { InputForm } from './components/InputForm';
import { FunctionTree } from './components/FunctionTree';
import { FlowCanvas } from './components/FlowCanvas';
import { DetailPanel } from './components/DetailPanel';
import { buildFullGraph } from './lib/buildFullGraph';

interface Props {
  analysisResult: AnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  inputs: AnalyzeParams;
  onInputsChange: (inputs: AnalyzeParams) => void;
  onAnalyze: (params: AnalyzeParams) => void;
  selectedFn: string | null;
  onSelectFn: (fn: string | null) => void;
  selectedQuery: QueryRecord | null;
  onSelectQuery: (q: QueryRecord | null) => void;
  hideHeader?: boolean;
}

export function App({
  analysisResult,
  isLoading,
  error,
  inputs,
  onInputsChange,
  onAnalyze,
  selectedFn,
  onSelectFn,
  selectedQuery,
  onSelectQuery,
  hideHeader,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  // Selection reset is handled in Root

  // Build the full graph once
  const fullGraph = useMemo(() => {
    if (!analysisResult) return { nodes: [], edges: [] };
    return buildFullGraph(analysisResult);
  }, [analysisResult]);

  // Stable key — only changes when a new analysis is loaded
  const graphKey = useMemo(() =>
    analysisResult ? `${analysisResult.functionName}-${analysisResult.totalQueries}` : '',
    [analysisResult]
  );

  // Highlight nodes belonging to the selected function or query + their children
  const visibleGraph = useMemo(() => {
    if (!selectedFn && !selectedQuery) return fullGraph;

    // Get all highlighted node IDs
    const highlightedIds = new Set<string>();
    if (selectedFn) {
      highlightedIds.add(`fn-${selectedFn}`);
      // Highlight direct queries of this function
      fullGraph.edges
        .filter(e => e.source === `fn-${selectedFn}`)
        .forEach(e => highlightedIds.add(e.target));
    }
    if (selectedQuery) {
      const qIdx = analysisResult?.queries.findIndex(q => q === selectedQuery) ?? -1;
      if (qIdx !== -1) {
        const qId = `q-${qIdx}`;
        highlightedIds.add(qId);
        // Also highlight its parent function for context
        highlightedIds.add(`fn-${selectedQuery.calledFrom}`);
      }
    }

    const nodes = fullGraph.nodes.map(node => {
      const isHighlighted = highlightedIds.has(node.id);
      const isSelected = (node.id === `fn-${selectedFn}`) || 
                         (selectedQuery && node.id === `q-${analysisResult?.queries.indexOf(selectedQuery)}`);

      if (node.type === 'functionNode') {
        return {
          ...node,
          style: {
            ...node.style,
            opacity: isHighlighted ? 1 : 0.2,
            filter: isSelected ? 'brightness(1.2) drop-shadow(0 0 10px rgba(99,102,241,0.5))' : 'none',
            outline: isSelected ? '2px solid var(--accent-blue)' : 'none',
            transition: 'all 0.3s ease',
          },
        };
      }
      if (node.type === 'queryNode') {
        const data = node.data as QueryNodeData;
        return {
          ...node,
          style: {
            ...node.style,
            opacity: isHighlighted ? 1 : 0.2,
            filter: isSelected ? 'brightness(1.2) drop-shadow(0 0 10px rgba(99,179,237,0.5))' : 'none',
            outline: isSelected ? '2px solid var(--accent-teal)' : 'none',
            transition: 'all 0.3s ease',
          },
          data: {
            ...data,
            isHighlighted,
            isDimmed: !isHighlighted,
          },
        };
      }
      return node;
    });

    // Fade edges as well
    const edges = fullGraph.edges.map(edge => ({
      ...edge,
      style: {
        ...edge.style,
        opacity: highlightedIds.has(edge.source) && highlightedIds.has(edge.target) ? 0.8 : 0.1,
        strokeWidth: highlightedIds.has(edge.source) && highlightedIds.has(edge.target) ? 3 : 1.5,
        transition: 'all 0.3s ease',
      }
    }));

    return { nodes, edges };
  }, [fullGraph, selectedFn, selectedQuery, analysisResult]);

  const handleNodeClick = useCallback<NodeMouseHandler>((_event, node) => {
    if (node.type === 'queryNode') {
      const data = node.data as QueryNodeData;
      onSelectQuery(data.query);
      onSelectFn(data.query.calledFrom);
    } else if (node.type === 'functionNode') {
      const data = node.data as FunctionNodeData;
      onSelectFn(data.label);
    }
  }, [onSelectQuery, onSelectFn]);

  const selectedFnQueryCount = useMemo(() =>
    analysisResult && selectedFn
      ? analysisResult.queries.filter(q => q.calledFrom === selectedFn).length
      : 0,
    [analysisResult, selectedFn]
  );

  const selectedNodeId = useMemo(() => {
    if (selectedQuery && analysisResult) {
      const idx = analysisResult.queries.findIndex(q => q === selectedQuery);
      if (idx !== -1) return `q-${idx}`;
    }
    if (selectedFn) {
      return `fn-${selectedFn}`;
    }
    return null;
  }, [selectedQuery, selectedFn, analysisResult]);

  return (
    <div className="app-inner">
      {!hideHeader && (
        <InputForm
          inputs={inputs}
          onInputsChange={onInputsChange}
          onAnalyze={onAnalyze}
          isLoading={isLoading}
        />
      )}

      {error && <div className="error-banner">⚠️ {error}</div>}

      <div className="main-content">
        {analysisResult && (
          <div className="left-panel">
            <div className="left-panel-search">
              <span className="left-search-icon">🔍</span>
              <input
                className="left-search-input"
                type="text"
                placeholder="Search functions & queries…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="left-search-clear" onClick={() => setSearchQuery('')}>✕</button>
              )}
            </div>
            <FunctionTree
              result={analysisResult}
              selectedFn={selectedFn}
              selectedQuery={selectedQuery}
              searchQuery={searchQuery}
              onSelectFn={onSelectFn}
              onSelectQuery={onSelectQuery}
            />
          </div>
        )}

        <div className="right-panel">
          {!analysisResult && !isLoading && (
            <div className="canvas-empty">
              <div className="canvas-empty-icon">🔍</div>
              <p>Enter a function name and file path above, then click Analyze</p>
              <span className="canvas-empty-hint">The full execution flow will appear here as an interactive graph</span>
            </div>
          )}

          {analysisResult && (
            <>
              <div className="subgraph-header">
                <div className="subgraph-title">
                  {selectedFn ? (
                    <>
                      <span className="subgraph-fn-icon">ƒ</span>
                      <span className="subgraph-fn-name">{selectedFn}</span>
                      <span className="subgraph-query-count">
                        {selectedFnQueryCount} direct {selectedFnQueryCount === 1 ? 'query' : 'queries'}
                      </span>
                    </>
                  ) : (
                    <span className="subgraph-fn-name">{analysisResult.functionName}</span>
                  )}
                  <span className="subgraph-total-badge">
                    {analysisResult.totalQueries} total queries · {analysisResult.callChain.length} functions
                  </span>
                </div>
                <div className="subgraph-hint">
                  Click any node to select · Highlighted = selected function's queries
                </div>
              </div>
              <div className="canvas-wrapper">
                <ReactFlowProvider>
                  <FlowCanvas
                    nodes={visibleGraph.nodes}
                    edges={visibleGraph.edges}
                    onNodeClick={handleNodeClick}
                    graphKey={graphKey}
                    selectedNodeId={selectedNodeId}
                  />
                </ReactFlowProvider>
              </div>
            </>
          )}
        </div>
      </div>

      <DetailPanel
        query={selectedQuery}
        callChain={analysisResult?.callChain ?? []}
        onClose={() => onSelectQuery(null)}
      />
    </div>
  );
}
