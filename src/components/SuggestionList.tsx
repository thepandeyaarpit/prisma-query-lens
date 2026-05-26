import type { Suggestion } from '../types';

const ICONS = { error: '🔴', warning: '🟡', info: '🔵' };

interface Props { suggestions: Suggestion[] }

export function SuggestionList({ suggestions }: Props) {
  if (suggestions.length === 0) {
    return (
      <div className="no-suggestions">
        <span>✅</span>
        <span>No issues detected — looking good!</span>
      </div>
    );
  }
  return (
    <div className="suggestion-list">
      {suggestions.map((s, i) => (
        <div key={i} className={`suggestion suggestion-${s.severity}`}>
          <span className="suggestion-icon">{ICONS[s.severity]}</span>
          <span className="suggestion-msg">{s.message}</span>
        </div>
      ))}
    </div>
  );
}
