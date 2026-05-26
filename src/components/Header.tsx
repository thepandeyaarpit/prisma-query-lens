export type ViewMode = 'new' | 'old';

interface Props {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
}

export function Header({ viewMode, onViewChange }: Props) {
  return (
    <div className="header">
      <div className="header-left">
        <div className="header-logo-icon">🔍</div>
        <div>
          <div className="header-title">Query Lens</div>
          <div className="header-subtitle">Visualize Prisma query execution flows</div>
        </div>
      </div>

      <div className="header-right">
        <div className="header-version">v1.0.6</div>
      </div>
    </div>
  );
}
