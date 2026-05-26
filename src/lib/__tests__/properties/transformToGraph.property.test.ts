// Feature: query-lens-react-flow-ui, Property 1: Graph node count matches AnalysisResult
// Feature: query-lens-react-flow-ui, Property 2: Every query has an edge from its calledFrom function
// Feature: query-lens-react-flow-ui, Property 3: Entry node is exactly the first callChain function
// Feature: query-lens-react-flow-ui, Property 4: N+1 warning flag matches direct child queries

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { transformToGraph } from '../../transformToGraph';
import { arbAnalysisResult } from './arbitraries';
import type { FunctionNodeData } from '../../../types';

describe('Property 1: Graph node count matches AnalysisResult', () => {
  /**
   * Validates: Requirements 1.1, 2.1, 3.1
   *
   * For any valid AnalysisResult, calling transformToGraph(result) SHALL produce
   * exactly result.callChain.length nodes of type 'functionNode' and exactly
   * result.queries.length nodes of type 'queryNode'.
   *
   * Note: orphan calledFrom values (not in callChain) may add extra function nodes,
   * so we check >= callChain.length for function nodes.
   */
  it('produces correct node counts for any AnalysisResult', () => {
    fc.assert(
      fc.property(arbAnalysisResult, (result) => {
        const { nodes } = transformToGraph(result);

        const functionNodes = nodes.filter((n) => n.type === 'functionNode');
        const queryNodes = nodes.filter((n) => n.type === 'queryNode');

        // callChain entries all get function nodes; orphan calledFrom values may add more
        const uniqueCalledFrom = new Set(result.queries.map((q) => q.calledFrom));
        const callChainSet = new Set(result.callChain);
        const orphanCount = [...uniqueCalledFrom].filter((cf) => !callChainSet.has(cf)).length;

        return (
          functionNodes.length === result.callChain.length + orphanCount &&
          queryNodes.length === result.queries.length
        );
      }),
      { numRuns: 200 }
    );
  });
});

describe('Property 2: Every query has an edge from its calledFrom function', () => {
  /**
   * Validates: Requirements 1.3
   *
   * For any valid AnalysisResult, for every QueryRecord at index i, the edges
   * returned by transformToGraph(result) SHALL contain an edge from
   * 'fn-' + query.calledFrom to 'q-' + i.
   */
  it('every query node has an incoming edge from its calledFrom function node', () => {
    fc.assert(
      fc.property(arbAnalysisResult, (result) => {
        const { edges } = transformToGraph(result);

        for (let i = 0; i < result.queries.length; i++) {
          const query = result.queries[i];
          const expectedSource = `fn-${query.calledFrom}`;
          const expectedTarget = `q-${i}`;

          const hasEdge = edges.some(
            (e) => e.source === expectedSource && e.target === expectedTarget
          );

          if (!hasEdge) return false;
        }
        return true;
      }),
      { numRuns: 200 }
    );
  });
});

describe('Property 3: Entry node is exactly the first callChain function', () => {
  /**
   * Validates: Requirements 2.3
   *
   * For any valid AnalysisResult with a non-empty callChain, exactly one
   * FunctionNode in the output of transformToGraph(result) SHALL have
   * data.isEntry === true, and its data.label SHALL equal result.callChain[0].
   */
  it('exactly one entry node exists and it matches callChain[0]', () => {
    fc.assert(
      fc.property(arbAnalysisResult, (result) => {
        if (result.callChain.length === 0) return true; // skip empty callChain

        const { nodes } = transformToGraph(result);
        const functionNodes = nodes.filter((n) => n.type === 'functionNode');
        const entryNodes = functionNodes.filter(
          (n) => (n.data as FunctionNodeData).isEntry === true
        );

        return (
          entryNodes.length === 1 &&
          (entryNodes[0].data as FunctionNodeData).label === result.callChain[0]
        );
      }),
      { numRuns: 200 }
    );
  });
});

describe('Property 4: N+1 warning flag matches direct child queries', () => {
  /**
   * Validates: Requirements 2.4
   *
   * For any valid AnalysisResult, for every function name F in callChain,
   * the corresponding FunctionNode's data.hasN1Warning SHALL be true if and
   * only if at least one QueryRecord with calledFrom === F has isInLoop === true.
   */
  it('hasN1Warning is true iff at least one direct child query has isInLoop=true', () => {
    fc.assert(
      fc.property(arbAnalysisResult, (result) => {
        const { nodes } = transformToGraph(result);

        for (const fnName of result.callChain) {
          const fnNode = nodes.find(
            (n) => n.type === 'functionNode' && n.id === `fn-${fnName}`
          );
          if (!fnNode) return false;

          const data = fnNode.data as FunctionNodeData;
          const directChildHasN1 = result.queries.some(
            (q) => q.calledFrom === fnName && q.isInLoop
          );

          if (data.hasN1Warning !== directChildHasN1) return false;
        }
        return true;
      }),
      { numRuns: 200 }
    );
  });
});
