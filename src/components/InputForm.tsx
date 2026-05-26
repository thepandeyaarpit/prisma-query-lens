import { useState, useEffect, useCallback } from 'react';
import type { AnalyzeParams } from '../types';
import { loadInputs, saveInputs, validateAnalyzeParams } from '../lib/storage';

interface Props {
  inputs: AnalyzeParams;
  onInputsChange: (inputs: AnalyzeParams) => void;
  onAnalyze: (params: AnalyzeParams) => void;
  isLoading: boolean;
}

export function InputForm({ inputs, onInputsChange, onAnalyze, isLoading }: Props) {
  const { functionName, filePath, workspaceRoot } = inputs;
  const [error, setError] = useState<string | null>(null);

  // Removed mount-time load, handled in Root

  const handleSubmit = useCallback(() => {
    const err = validateAnalyzeParams(inputs);
    if (err) { setError(err); return; }
    setError(null);
    onAnalyze(inputs);
  }, [inputs, onAnalyze]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSubmit]);

  return (
    <div className="form-section">
      <div className="form-row">
        <div className="form-group" style={{ flex: '0 0 220px' }}>
          <label>Function Name</label>
          <input
            type="text"
            value={functionName}
            onChange={e => onInputsChange({ ...inputs, functionName: e.target.value })}
            placeholder="e.g. getUserById"
          />
        </div>
        <div className="form-group" style={{ flex: 2 }}>
          <label>File Path (absolute)</label>
          <input
            type="text"
            value={filePath}
            onChange={e => onInputsChange({ ...inputs, filePath: e.target.value })}
            placeholder="e.g. D:\project\src\services\user.service.ts"
          />
        </div>
        <div className="form-group" style={{ flex: 1.5 }}>
          <label>Workspace Root (optional)</label>
          <input
            type="text"
            value={workspaceRoot}
            onChange={e => onInputsChange({ ...inputs, workspaceRoot: e.target.value })}
            placeholder="e.g. D:\project"
          />
        </div>
        <button
          className="analyze-btn"
          onClick={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="btn-spinner" />
              Analyzing…
            </span>
          ) : 'Analyze'}
        </button>
      </div>
      {error && <div className="form-error">⚠ {error}</div>}
    </div>
  );
}
