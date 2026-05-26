import type { AnalysisResult, AnalysisStats } from '../types';

export function computeStats(result: AnalysisResult): AnalysisStats {
  return {
    totalQueries: result.queries.length,
    n1Count: result.queries.filter(q => q.isInLoop).length,
    uniqueModelCount: new Set(result.queries.map(q => q.model)).size,
    functionCount: result.callChain.length,
    maxDepth: result.queries.reduce((max, q) => Math.max(max, q.callDepth), 0),
  };
}
