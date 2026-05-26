import type { AnalyzeParams } from '../types';

/**
 * Validates AnalyzeParams before sending to the Analyze API.
 * Returns an error string when functionName or filePath is empty/whitespace-only.
 * Returns null when both fields are non-empty.
 */
export function validateAnalyzeParams(params: AnalyzeParams): string | null {
  if (params.functionName.trim() === '') {
    return 'Function name is required.';
  }
  if (params.filePath.trim() === '') {
    return 'File path is required.';
  }
  return null;
}
