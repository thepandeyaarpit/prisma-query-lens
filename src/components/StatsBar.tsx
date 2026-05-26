import type { AnalysisStats } from '../types';

interface Props { stats: AnalysisStats }

export function StatsBar({ stats }: Props) {
  return (
    <div className="stats-bar">
      <Stat value={stats.totalQueries} label="Total Queries" />
      <Stat value={stats.n1Count} label="N+1 Risks" danger={stats.n1Count > 0} showPulse={stats.n1Count > 0} />
      <Stat value={stats.uniqueModelCount} label="Models" />
      <Stat value={stats.functionCount} label="Functions" />
      <Stat value={stats.maxDepth} label="Max Depth" />
    </div>
  );
}

function Stat({ value, label, danger, showPulse }: { value: number; label: string; danger?: boolean; showPulse?: boolean }) {
  return (
    <div className={`stat${danger ? ' stat-danger' : ''}`}>
      <div className="stat-value">
        {value}
        {showPulse && <span className="stat-pulse-dot" />}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
