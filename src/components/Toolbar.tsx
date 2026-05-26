import type { AnalysisStats, OperationType } from '../types';

const ALL_TYPES: OperationType[] = ['read', 'write', 'update', 'delete', 'raw'];
const TYPE_LABELS: Record<OperationType, string> = {
  read: 'Read', write: 'Write', update: 'Update', delete: 'Delete', raw: 'Raw',
};

interface Props {
  stats: AnalysisStats;
  callChain: string[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilters: Set<OperationType>;
  onFilterToggle: (type: OperationType) => void;
}

export function Toolbar({ stats, callChain, searchQuery, onSearchChange, activeFilters, onFilterToggle }: Props) {
  return (
    <div className="toolbar">
      {/* Stats inline */}
      <div className="toolbar-stats">
        <StatPill value={stats.totalQueries} label="Queries" />
        <StatPill value={stats.n1Count} label="N+1" danger={stats.n1Count > 0} />
        <StatPill value={stats.uniqueModelCount} label="Models" />
        <StatPill value={stats.functionCount} label="Fns" />
        <StatPill value={stats.maxDepth} label="Depth" />
      </div>

      <div className="toolbar-divider" />

      {/* Search */}
      <div className="toolbar-search">
        <span className="toolbar-search-icon">🔍</span>
        <input
          className="toolbar-search-input"
          type="text"
          placeholder="Search…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button className="toolbar-search-clear" onClick={() => onSearchChange('')}>✕</button>
        )}
      </div>

      <div className="toolbar-divider" />

      {/* Filters */}
      <div className="toolbar-filters">
        {ALL_TYPES.map(type => (
          <button
            key={type}
            className={`filter-btn filter-btn-${type}${activeFilters.has(type) ? ' active' : ''}`}
            onClick={() => onFilterToggle(type)}
            title={`Toggle ${TYPE_LABELS[type]} queries`}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Call chain — scrollable, right side */}
      {callChain.length > 0 && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-chain">
            <span className="toolbar-chain-label">Chain:</span>
            <div className="toolbar-chain-scroll">
              {callChain.map((fn, i) => (
                <span key={fn} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span className="fn-chip">{fn}</span>
                  {i < callChain.length - 1 && <span className="chain-arrow">›</span>}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatPill({ value, label, danger }: { value: number; label: string; danger?: boolean }) {
  return (
    <div className={`stat-pill${danger ? ' stat-pill-danger' : ''}`}>
      <span className="stat-pill-value">{value}</span>
      <span className="stat-pill-label">{label}</span>
    </div>
  );
}
