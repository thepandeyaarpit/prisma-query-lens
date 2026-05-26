import type { OperationType } from '../types';

const ALL_TYPES: OperationType[] = ['read', 'write', 'update', 'delete', 'raw'];

const TYPE_LABELS: Record<OperationType, string> = {
  read: 'Read',
  write: 'Write',
  update: 'Update',
  delete: 'Delete',
  raw: 'Raw',
};

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilters: Set<OperationType>;
  onFilterToggle: (type: OperationType) => void;
}

export function SearchFilterBar({ searchQuery, onSearchChange, activeFilters, onFilterToggle }: Props) {
  return (
    <div className="search-filter-bar">
      <div className="search-input-wrapper">
        <span className="search-input-icon">🔍</span>
        <input
          className="search-input"
          type="text"
          placeholder="Search functions, models, methods…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      <div className="filter-toggles">
        {ALL_TYPES.map(type => (
          <button
            key={type}
            className={`filter-btn filter-btn-${type}${activeFilters.has(type) ? ' active' : ''}`}
            onClick={() => onFilterToggle(type)}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  );
}
