import type { AnalyzeParams, AnalysisResult } from '../types';

const STORAGE_KEY = 'queryLensInputs';
const RESULT_KEY = 'queryLensResult';

export function saveInputs(params: AnalyzeParams): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // ignore storage errors
  }
}

export function loadInputs(): Partial<AnalyzeParams> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<AnalyzeParams>;
  } catch {
    return {};
  }
}

export function saveResult(result: AnalysisResult | null): void {
  try {
    if (result) {
      localStorage.setItem(RESULT_KEY, JSON.stringify(result));
    } else {
      localStorage.removeItem(RESULT_KEY);
    }
  } catch {
    // ignore
  }
}

export function loadResult(): AnalysisResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AnalysisResult;
  } catch {
    return null;
  }
}

export function validateAnalyzeParams(params: AnalyzeParams): string | null {
  if (!params.functionName.trim()) return 'Function name is required.';
  if (!params.filePath.trim()) return 'File path is required.';
  return null;
}
