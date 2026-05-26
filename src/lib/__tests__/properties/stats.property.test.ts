// Feature: query-lens-react-flow-ui, Property 11: Stats computation is correct for any AnalysisResult

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { computeStats } from '../../stats';
import { arbAnalysisResult } from './arbitraries';

describe('Property 11: Stats computation is correct for any AnalysisResult', () => {
  /**
   * Validates: Requirements 7.1, 7.2
   *
   * For any valid AnalysisResult, computeStats(result) SHALL return:
   * - totalQueries === result.queries.length
   * - n1Count === result.queries.filter(q => q.isInLoop).length
   * - uniqueModelCount === new Set(result.queries.map(q => q.model)).size
   * - functionCount === result.callChain.length
   * - maxDepth === Math.max(0, ...result.queries.map(q => q.callDepth))
   */
  it('computes all five stat fields correctly for any AnalysisResult', () => {
    fc.assert(
      fc.property(arbAnalysisResult, (result) => {
        const stats = computeStats(result);

        const expectedTotalQueries = result.queries.length;
        const expectedN1Count = result.queries.filter((q) => q.isInLoop).length;
        const expectedUniqueModelCount = new Set(result.queries.map((q) => q.model)).size;
        const expectedFunctionCount = result.callChain.length;
        const expectedMaxDepth =
          result.queries.length === 0
            ? 0
            : result.queries.reduce((max, q) => Math.max(max, q.callDepth), 0);

        return (
          stats.totalQueries === expectedTotalQueries &&
          stats.n1Count === expectedN1Count &&
          stats.uniqueModelCount === expectedUniqueModelCount &&
          stats.functionCount === expectedFunctionCount &&
          stats.maxDepth === expectedMaxDepth
        );
      }),
      { numRuns: 200 }
    );
  });

  it('returns zero maxDepth for empty queries array', () => {
    fc.assert(
      fc.property(arbAnalysisResult, (result) => {
        if (result.queries.length > 0) return true; // skip non-empty
        const stats = computeStats(result);
        return stats.maxDepth === 0;
      }),
      { numRuns: 200 }
    );
  });
});
