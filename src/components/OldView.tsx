import { useState, useCallback, useEffect } from 'react';
import type { AnalysisResult, AnalyzeParams, QueryRecord } from '../types';
import { loadInputs, saveInputs, validateAnalyzeParams } from '../lib/storage';
import { computeSuggestions } from '../lib/suggestions';

// ── Old UI — faithful recreation of the original vanilla HTML/CSS/JS UI ──

function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMethodClass(method: string): string {
  if (['findFirst','findMany','findUnique','findUniqueOrThrow','findFirstOrThrow'].includes(method)) return 'ov-read';
  if (['create','createMany','upsert'].includes(method)) return 'ov-create';
  if (['update','updateMany'].includes(method)) return 'ov-update';
  if (['delete','deleteMany'].includes(method)) return 'ov-delete';
  if (method.startsWith('$')) return 'ov-raw';
  return 'ov-other';
}

export function OldView({
  analysisResult: result,
  isLoading,
  error,
  inputs,
  onInputsChange,
  onAnalyze,
  hideForm,
}: {
  analysisResult: AnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  inputs: AnalyzeParams;
  onInputsChange: (inputs: AnalyzeParams) => void;
  onAnalyze: (params: AnalyzeParams) => void;
  hideForm?: boolean;
}) {
  const { functionName, filePath, workspaceRoot } = inputs;
  const [openSql, setOpenSql] = useState<Set<number>>(new Set());

  // Reset open SQL when result changes
  useEffect(() => { setOpenSql(new Set()); }, [result]);

  const handleAnalyze = useCallback(() => {
    onAnalyze(inputs);
  }, [inputs, onAnalyze]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAnalyze();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleAnalyze]);

  const toggleSql = (idx: number) => {
    setOpenSql(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const copySql = (sql: string, btn: HTMLButtonElement) => {
    navigator.clipboard.writeText(sql).then(() => {
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = 'Copy SQL'; }, 1500);
    });
  };

  return (
    <div className="ov-root">
      {/* Form */}
      {!hideForm && (
        <div className="ov-form">
          <div className="ov-form-row">
            <div className="ov-form-group" style={{ flex: '0 0 220px' }}>
              <label className="ov-label">Function Name</label>
              <input className="ov-input" type="text" value={functionName}
                onChange={e => onInputsChange({ ...inputs, functionName: e.target.value })}
                placeholder="e.g. automaticMessage" />
            </div>
            <div className="ov-form-group" style={{ flex: 2 }}>
              <label className="ov-label">File Path (absolute)</label>
              <input className="ov-input" type="text" value={filePath}
                onChange={e => onInputsChange({ ...inputs, filePath: e.target.value })}
                placeholder="e.g. D:\project\src\services\user.service.ts" />
            </div>
            <div className="ov-form-group" style={{ flex: 1.5 }}>
              <label className="ov-label">Workspace Root (optional)</label>
              <input className="ov-input" type="text" value={workspaceRoot}
                onChange={e => onInputsChange({ ...inputs, workspaceRoot: e.target.value })}
                placeholder="e.g. D:\project" />
            </div>
            <button className="ov-btn" onClick={handleAnalyze} disabled={isLoading}>
              {isLoading ? <><span className="ov-spinner" /> Analyzing…</> : 'Analyze'}
            </button>
          </div>
          {error && <div className="ov-error">⚠️ {error}</div>}
        </div>
      )}

      {/* Results */}
      <div className="ov-results">
        {isLoading && (
          <div className="ov-loading">
            <div className="ov-spinner-lg" />
            <p>Analyzing <strong>{functionName}</strong> and all sub-functions…</p>
          </div>
        )}

        {!isLoading && !result && !error && (
          <div className="ov-empty">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <p>Enter a function name and file path above, then click Analyze</p>
          </div>
        )}

        {!isLoading && result && (() => {
          const n1 = result.queries.filter(q => q.isInLoop);
          const models = [...new Set(result.queries.map(q => q.model))];
          const maxDepth = result.queries.reduce((m, q) => Math.max(m, q.callDepth), 0);
          return (
            <>
              {/* Stats */}
              <div className="ov-stats">
                <div className="ov-stat"><div className="ov-stat-val">{result.totalQueries}</div><div className="ov-stat-lbl">Total Queries</div></div>
                <div className={`ov-stat${n1.length > 0 ? ' ov-stat-danger' : ''}`}><div className="ov-stat-val">{n1.length}</div><div className="ov-stat-lbl">N+1 Risks</div></div>
                <div className="ov-stat"><div className="ov-stat-val">{models.length}</div><div className="ov-stat-lbl">Models</div></div>
                <div className="ov-stat"><div className="ov-stat-val">{result.callChain.length}</div><div className="ov-stat-lbl">Functions</div></div>
                <div className="ov-stat"><div className="ov-stat-val">{maxDepth}</div><div className="ov-stat-lbl">Max Depth</div></div>
              </div>

              {/* Call chain */}
              {result.callChain.length > 0 && (
                <div className="ov-chain">
                  <span className="ov-chain-lbl">Call chain:</span>
                  {result.callChain.map((fn, i) => (
                    <span key={fn} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="ov-fn-chip">{fn}</span>
                      {i < result.callChain.length - 1 && <span className="ov-arrow">→</span>}
                    </span>
                  ))}
                </div>
              )}

              {/* Models */}
              {models.length > 0 && (
                <div className="ov-models">
                  <span className="ov-models-lbl">Models:</span>
                  {models.map(m => <span key={m} className="ov-model-tag">{m}</span>)}
                </div>
              )}

              {/* Queries */}
              {result.queries.length === 0 ? (
                <div className="ov-no-queries">No Prisma queries found in <strong>{result.functionName}</strong> or its sub-functions.</div>
              ) : (
                <div className="ov-queries">
                  {result.queries.map((q, i) => (
                    <div key={i} className={`ov-card${q.isInLoop ? ' ov-card-n1' : ''}`}>
                      <div className="ov-card-header">
                        <div className="ov-card-left">
                          <span className="ov-num">#{i + 1}</span>
                          <span className={`ov-method ${getMethodClass(q.method)}`}>{q.method}</span>
                          <span className="ov-model">{q.model}</span>
                          {q.isInLoop && <span className="ov-badge-n1">⚡ N+1</span>}
                          {q.model === '$raw' && <span className="ov-badge-raw">RAW</span>}
                          {q.callDepth > 0 && <span className="ov-depth">depth {q.callDepth}</span>}
                        </div>
                        <div className="ov-card-right">
                          <span className="ov-called">{q.calledFrom}()</span>
                          <span className="ov-line">line {q.line}</span>
                          <span className="ov-file">{q.filePath}</span>
                        </div>
                      </div>
                      {(q.where || q.select || q.include || q.take !== undefined || q.skip !== undefined || q.rawQuery) && (
                        <div className="ov-card-body">
                          {q.where && <div className="ov-detail"><span className="ov-dk">where</span><code className="ov-dv">{q.where}</code></div>}
                          {q.select && <div className="ov-detail"><span className="ov-dk">select</span><code className="ov-dv">{q.select}</code></div>}
                          {q.include && <div className="ov-detail"><span className="ov-dk">include</span><code className="ov-dv">{q.include}</code></div>}
                          {(q.take !== undefined || q.skip !== undefined) && (
                            <div className="ov-detail"><span className="ov-dk">pagination</span><code className="ov-dv">{q.take !== undefined ? `take: ${q.take}` : ''}{q.take !== undefined && q.skip !== undefined ? ', ' : ''}{q.skip !== undefined ? `skip: ${q.skip}` : ''}</code></div>
                          )}
                          {q.rawQuery && <div className="ov-detail"><span className="ov-dk">raw</span><code className="ov-dv">{q.rawQuery.slice(0, 150)}</code></div>}
                        </div>
                      )}
                      <div className="ov-sql-section">
                        <div className="ov-sql-btns">
                          <button className="ov-btn-sm" onClick={() => toggleSql(i)}>
                            {openSql.has(i) ? 'Hide SQL ▲' : 'Show SQL ▼'}
                          </button>
                          <button className="ov-btn-sm" onClick={e => copySql(q.sql, e.currentTarget)}>Copy SQL</button>
                        </div>
                        {openSql.has(i) && (
                          <div className="ov-sql-block">
                            <pre>{q.sql}</pre>
                          </div>
                        )}
                      </div>
                      <OvSuggestions query={q} />
                    </div>
                  ))}
                </div>
              )}

              {/* Errors */}
              {result.errors && result.errors.length > 0 && (
                <div className="ov-errors">
                  {result.errors.map((e, i) => <div key={i} className="ov-err-item">{e}</div>)}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── Inline suggestions component for Classic View ──
const SEV_ICON: Record<string, string> = { error: '🔴', warning: '🟡', info: '🔵' };
const SEV_COLOR: Record<string, string> = {
  error: '#f48771',
  warning: '#dcdcaa',
  info: '#569cd6',
};
const SEV_BG: Record<string, string> = {
  error: 'rgba(244,135,113,0.07)',
  warning: 'rgba(220,220,170,0.07)',
  info: 'rgba(86,156,214,0.07)',
};
const SEV_BORDER: Record<string, string> = {
  error: 'rgba(244,135,113,0.2)',
  warning: 'rgba(220,220,170,0.2)',
  info: 'rgba(86,156,214,0.2)',
};

function OvSuggestions({ query }: { query: QueryRecord }) {
  const [open, setOpen] = useState(false);
  const suggestions = computeSuggestions(query);
  if (suggestions.length === 0 && !open) return null;

  return (
    <div className="ov-suggestions-section">
      <button
        className="ov-btn-sm ov-suggestions-toggle"
        onClick={() => setOpen(o => !o)}
        style={{ color: suggestions.length > 0 ? (suggestions.some(s => s.severity === 'error') ? '#f48771' : '#dcdcaa') : '#888' }}
      >
        {suggestions.length > 0
          ? `${open ? '▲' : '▼'} ${suggestions.length} Optimization Suggestion${suggestions.length > 1 ? 's' : ''}`
          : `${open ? '▲' : '▼'} No Issues Detected`}
      </button>
      {open && (
        <div className="ov-suggestions-list">
          {suggestions.length === 0 ? (
            <div className="ov-suggestion-ok">✅ No issues detected — this query looks good.</div>
          ) : (
            suggestions.map((s, i) => (
              <div
                key={i}
                className="ov-suggestion-item"
                style={{
                  background: SEV_BG[s.severity],
                  borderLeft: `3px solid ${SEV_COLOR[s.severity]}`,
                  border: `1px solid ${SEV_BORDER[s.severity]}`,
                  borderLeftWidth: 3,
                }}
              >
                <span className="ov-sug-icon">{SEV_ICON[s.severity]}</span>
                <span className="ov-sug-msg">{s.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
