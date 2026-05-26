import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { OldView } from './components/OldView';
import { Header } from './components/Header';
import { InputForm } from './components/InputForm';
import type { AnalysisResult, AnalyzeParams, QueryRecord } from './types';
import { saveInputs, validateAnalyzeParams, saveResult, loadResult, loadInputs } from './lib/storage';

function Root() {
  const [inputs, setInputs] = useState<AnalyzeParams>(() => {
    const saved = loadInputs();
    return {
      functionName: saved.functionName || '',
      filePath: saved.filePath || '',
      workspaceRoot: saved.workspaceRoot || '',
    };
  });

  // Shared analysis state — persists across view switches and reloads
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(() => loadResult());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared selection state
  const [selectedFn, setSelectedFn] = useState<string | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<QueryRecord | null>(null);

  // View state (exclusive)
  const [activeView, setActiveView] = useState<'new' | 'old'>('new');

  // Reset selection when result changes
  useEffect(() => {
    if (analysisResult?.callChain?.length) {
      setSelectedFn(analysisResult.callChain[0]);
    } else {
      setSelectedFn(null);
    }
    setSelectedQuery(null);
  }, [analysisResult]);

  const handleAnalyze = useCallback(async (params: AnalyzeParams) => {
    const err = validateAnalyzeParams(params);
    if (err) { setError(err); return; }
    setInputs(params);
    setError(null);
    saveInputs(params);
    setIsLoading(true);
    setAnalysisResult(null);

    try {
      const res = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed');
        return;
      }
      setAnalysisResult(data as AnalysisResult);
      saveResult(data as AnalysisResult);
      
      // Default to graph view on success
      setActiveView('new');
    } catch (e) {
      setError('Could not connect to server: ' + (e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="app">
      <Header viewMode={activeView} onViewChange={() => {}} />
      
      <InputForm
        inputs={inputs}
        onInputsChange={setInputs}
        onAnalyze={handleAnalyze}
        isLoading={isLoading}
      />

      {error && <div className="error-banner" style={{ margin: '0 28px 16px' }}>⚠️ {error}</div>}

      <div className="view-switcher">
        <div className="switcher-tabs">
          <button 
            className={`switcher-tab ${activeView === 'new' ? 'active' : ''}`}
            onClick={() => setActiveView('new')}
          >
            <span className="tab-icon">📊</span>
            Interactive Execution Graph
          </button>
          <button 
            className={`switcher-tab ${activeView === 'old' ? 'active' : ''}`}
            onClick={() => setActiveView('old')}
          >
            <span className="tab-icon">📜</span>
            Classic List View
          </button>
        </div>

        <div className="view-content">
          <div className="view-pane" style={{ display: activeView === 'new' ? 'flex' : 'none' }}>
            <App
              analysisResult={analysisResult}
              isLoading={isLoading}
              error={null}
              inputs={inputs}
              onInputsChange={setInputs}
              onAnalyze={handleAnalyze}
              selectedFn={selectedFn}
              onSelectFn={setSelectedFn}
              selectedQuery={selectedQuery}
              onSelectQuery={setSelectedQuery}
              hideHeader={true}
            />
          </div>

          <div className="view-pane" style={{ display: activeView === 'old' ? 'flex' : 'none' }}>
            <OldView
              analysisResult={analysisResult}
              isLoading={isLoading}
              error={null}
              inputs={inputs}
              onInputsChange={setInputs}
              onAnalyze={handleAnalyze}
              hideForm={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
