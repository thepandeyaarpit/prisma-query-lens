import { useEffect, useRef, useState } from 'react';
import type { QueryRecord } from '../types';
import { computeSuggestions } from '../lib/suggestions';
import { SuggestionList } from './SuggestionList';

interface Props {
  query: QueryRecord | null;
  callChain: string[];
  onClose: () => void;
}

export function DetailPanel({ query, callChain, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (query) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [query, onClose]);

  if (!query) return null;

  const suggestions = computeSuggestions(query);

  // Execution path: from callChain[0] to query.calledFrom
  const callerIdx = callChain.indexOf(query.calledFrom);
  const execPath = callerIdx >= 0 ? callChain.slice(0, callerIdx + 1) : [query.calledFrom];

  const handleCopy = () => {
    navigator.clipboard.writeText(query.sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="detail-panel-overlay">
      <div className="detail-panel" ref={panelRef}>
        <div className="detail-panel-header">
          <div>
            <span className="detail-panel-title">{query.model}</span>
            <span className={`method-badge method-sm method-${getOpType(query.method)}`}>
              {query.method}
            </span>
          </div>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>

        <div className="detail-panel-body">
          {/* Metadata */}
          <section className="detail-section">
            <h3>Details</h3>
            <div className="detail-grid">
              <span className="detail-key">File</span>
              <span className="detail-val mono">{query.fullFilePath}</span>
              <span className="detail-key">Function</span>
              <span className="detail-val mono">{query.calledFrom}()</span>
              <span className="detail-key">Line</span>
              <span className="detail-val mono">{query.line}</span>
              <span className="detail-key">Depth</span>
              <span className="detail-val mono">{query.callDepth}</span>
              {query.isInLoop && (
                <>
                  <span className="detail-key">Risk</span>
                  <span className="detail-val n1-text">⚡ N+1 — runs inside a loop</span>
                </>
              )}
            </div>
          </section>

          {/* Prisma args */}
          {(query.where || query.select || query.include || query.orderBy || query.take !== undefined || query.skip !== undefined) && (
            <section className="detail-section">
              <h3>Query Arguments</h3>
              <div className="detail-grid">
                {query.where && <><span className="detail-key">where</span><code className="detail-val mono">{query.where}</code></>}
                {query.select && <><span className="detail-key">select</span><code className="detail-val mono">{query.select}</code></>}
                {query.include && <><span className="detail-key">include</span><code className="detail-val mono">{query.include}</code></>}
                {query.orderBy && <><span className="detail-key">orderBy</span><code className="detail-val mono">{query.orderBy}</code></>}
                {query.take !== undefined && <><span className="detail-key">take</span><code className="detail-val mono">{query.take}</code></>}
                {query.skip !== undefined && <><span className="detail-key">skip</span><code className="detail-val mono">{query.skip}</code></>}
              </div>
            </section>
          )}

          {/* SQL */}
          <section className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3>Generated SQL</h3>
              <button className="copy-btn" onClick={handleCopy}>
                {copied ? '✓ Copied!' : 'Copy SQL'}
              </button>
            </div>
            <pre className="sql-block">{query.sql}</pre>
          </section>

          {/* Execution path */}
          <section className="detail-section">
            <h3>Execution Path</h3>
            <ol className="exec-path">
              {execPath.map((fn, i) => (
                <li key={i} className="exec-path-item">{fn}()</li>
              ))}
            </ol>
          </section>

          {/* Suggestions */}
          <section className="detail-section">
            <h3>Optimization Suggestions</h3>
            <SuggestionList suggestions={suggestions} />
          </section>
        </div>
      </div>
    </div>
  );
}

function getOpType(method: string): string {
  if (['findMany','findFirst','findUnique','findUniqueOrThrow','findFirstOrThrow','count','aggregate','groupBy'].includes(method)) return 'read';
  if (['create','createMany','upsert'].includes(method)) return 'write';
  if (['update','updateMany'].includes(method)) return 'update';
  if (['delete','deleteMany'].includes(method)) return 'delete';
  if (method.startsWith('$')) return 'raw';
  return 'read';
}
