import { useState } from 'react';
import type { AnalysisResult, QueryRecord, OperationType } from '../types';
import { getOperationType } from '../lib/operationType';
import { computeStats } from '../lib/stats';

const OP_COLORS: Record<OperationType, string> = {
  read: '#4fd1c5',
  write: '#68d391',
  update: '#f6e05e',
  delete: '#fc8181',
  raw: '#f687b3',
};

const OP_BG: Record<OperationType, string> = {
  read: 'rgba(79,209,197,0.1)',
  write: 'rgba(104,211,145,0.1)',
  update: 'rgba(246,224,94,0.1)',
  delete: 'rgba(252,129,129,0.1)',
  raw: 'rgba(246,135,179,0.1)',
};

interface Props {
  result: AnalysisResult;
  selectedFn: string | null;
  selectedQuery: QueryRecord | null;
  searchQuery: string;
  onSelectFn: (fn: string) => void;
  onSelectQuery: (q: QueryRecord) => void;
}

export function FunctionTree({ result, selectedFn, selectedQuery, searchQuery, onSelectFn, onSelectQuery }: Props) {
  const [expandedFns, setExpandedFns] = useState<Set<string>>(new Set(result.callChain.slice(0, 5)));
  const stats = computeStats(result);

  // Build function list with their queries
  const fnNames = result.callChain.length > 0
    ? result.callChain
    : [...new Set(result.queries.map(q => q.calledFrom))];

  const q = searchQuery.toLowerCase().trim();

  const toggleFn = (fn: string) => {
    setExpandedFns(prev => {
      const next = new Set(prev);
      if (next.has(fn)) next.delete(fn);
      else next.add(fn);
      return next;
    });
  };

  return (
    <div className="fn-tree">
      {/* Stats header */}
      <div className="fn-tree-header">
        <div className="fn-tree-stats">
          <span className="fn-tree-stat"><span className="fn-tree-stat-val">{stats.totalQueries}</span> queries</span>
          {stats.n1Count > 0 && <span className="fn-tree-stat danger"><span className="fn-tree-stat-val">{stats.n1Count}</span> N+1</span>}
          <span className="fn-tree-stat"><span className="fn-tree-stat-val">{stats.functionCount}</span> fns</span>
        </div>
        <button
          className="fn-tree-expand-all"
          onClick={() => setExpandedFns(new Set(fnNames))}
          title="Expand all"
        >
          ⊞ All
        </button>
      </div>

      {/* Function list */}
      <div className="fn-tree-list">
        {fnNames.map((fnName, idx) => {
          const queries = result.queries.filter(q2 => q2.calledFrom === fnName);
          const isEntry = idx === 0;
          const isExpanded = expandedFns.has(fnName);
          const isSelected = selectedFn === fnName;
          const hasN1 = queries.some(q2 => q2.isInLoop);

          // Filter by search
          const matchesFn = !q || fnName.toLowerCase().includes(q);
          const matchingQueries = queries.filter(q2 =>
            !q || q2.model.toLowerCase().includes(q) || q2.method.toLowerCase().includes(q) || fnName.toLowerCase().includes(q)
          );
          if (!matchesFn && matchingQueries.length === 0) return null;

          return (
            <div key={fnName} className={`fn-tree-item${isSelected ? ' fn-tree-item-selected' : ''}`}>
              {/* Function row */}
              <div
                className={`fn-tree-fn-row${isEntry ? ' fn-tree-fn-entry' : ''}`}
                onClick={() => { onSelectFn(fnName); if (!isExpanded) toggleFn(fnName); }}
              >
                <button
                  className="fn-tree-toggle"
                  onClick={e => { e.stopPropagation(); toggleFn(fnName); }}
                >
                  {queries.length > 0 ? (isExpanded ? '▾' : '▸') : '·'}
                </button>
                <span className="fn-tree-fn-icon">{isEntry ? '⚡' : 'ƒ'}</span>
                <span className="fn-tree-fn-name" title={fnName}>{fnName}</span>
                {hasN1 && <span className="fn-tree-n1-dot" title="N+1 risk">⚠</span>}
                {queries.length > 0 && (
                  <span className="fn-tree-query-count">{queries.length}</span>
                )}
              </div>

              {/* Query rows */}
              {isExpanded && (
                <div className="fn-tree-queries">
                  {(matchingQueries.length > 0 ? matchingQueries : queries).map((query, qi) => {
                    const opType = getOperationType(query.method);
                    const isQSelected = selectedQuery === query;
                    return (
                      <div
                        key={qi}
                        className={`fn-tree-query-row${isQSelected ? ' fn-tree-query-selected' : ''}`}
                        onClick={() => onSelectQuery(query)}
                        style={{ borderLeftColor: OP_COLORS[opType] }}
                      >
                        <span
                          className="fn-tree-method"
                          style={{ color: OP_COLORS[opType], background: OP_BG[opType] }}
                        >
                          {query.method}
                        </span>
                        <span className="fn-tree-model">{query.model}</span>
                        {query.isInLoop && <span className="fn-tree-n1-badge">N+1</span>}
                        <span className="fn-tree-line">:{query.line}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
