// Feature: query-lens-react-flow-ui, Property 7: Severity values are always valid
// Feature: query-lens-react-flow-ui, Property 8: N+1 rule fires for all in-loop queries
// Feature: query-lens-react-flow-ui, Property 9: Missing select rule fires for read methods without select
// Feature: query-lens-react-flow-ui, Property 10: No false positives for well-formed queries

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { computeSuggestions } from '../../suggestions';
import { arbQueryRecord } from './arbitraries';
import { READ_METHODS } from '../../operationType';
import type { QueryRecord } from '../../../types';

const VALID_SEVERITIES = ['error', 'warning', 'info'] as const;

// Arbitrary for a well-formed query that should produce no suggestions
const arbWellFormedReadQuery: fc.Arbitrary<QueryRecord> = fc.record({
  model: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,19}$/),
  method: fc.constantFrom(...READ_METHODS),
  line: fc.integer({ min: 1, max: 9999 }),
  filePath: fc.string({ minLength: 1, maxLength: 100 }),
  fullFilePath: fc.string({ minLength: 1, maxLength: 200 }),
  calledFrom: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/),
  callDepth: fc.integer({ min: 0, max: 10 }),
  isInLoop: fc.constant(false),
  clientAlias: fc.constant('prisma'),
  sql: fc.string({ minLength: 1, maxLength: 200 }),
  where: fc.string({ minLength: 1, maxLength: 50 }),   // defined
  select: fc.string({ minLength: 1, maxLength: 50 }),  // defined
  // include: undefined (not present)
  // take: defined for findMany (handled below)
}).chain((base) => {
  // For findMany, we need take to be defined to avoid the unbounded findMany warning
  if (base.method === 'findMany') {
    return fc.integer({ min: 1, max: 1000 }).map((take) => ({ ...base, take }));
  }
  return fc.constant(base);
});

describe('Property 7: Severity values are always valid', () => {
  /**
   * Validates: Requirements 5.8
   *
   * For any QueryRecord, every Suggestion returned by computeSuggestions(query)
   * SHALL have a severity field whose value is one of 'error' | 'warning' | 'info'.
   */
  it('all suggestions have valid severity values', () => {
    fc.assert(
      fc.property(arbQueryRecord([]), (query) => {
        const suggestions = computeSuggestions(query);
        return suggestions.every((s) =>
          (VALID_SEVERITIES as readonly string[]).includes(s.severity)
        );
      }),
      { numRuns: 200 }
    );
  });
});

describe('Property 8: N+1 rule fires for all in-loop queries', () => {
  /**
   * Validates: Requirements 5.1
   *
   * For any QueryRecord where isInLoop === true, computeSuggestions(query)
   * SHALL return at least one suggestion with severity === 'error' containing
   * the N+1 warning.
   */
  it('returns an error suggestion for any in-loop query', () => {
    fc.assert(
      fc.property(
        arbQueryRecord([]).map((q) => ({ ...q, isInLoop: true })),
        (query) => {
          const suggestions = computeSuggestions(query);
          return suggestions.some(
            (s) => s.severity === 'error' && s.message.includes('N+1')
          );
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('Property 9: Missing select rule fires for read methods without select', () => {
  /**
   * Validates: Requirements 5.2
   *
   * For any QueryRecord where method is a read method and select is undefined,
   * computeSuggestions(query) SHALL return at least one suggestion with
   * severity === 'warning' about the missing select clause.
   */
  it('returns a warning suggestion for read methods without select', () => {
    fc.assert(
      fc.property(
        arbQueryRecord([]).map((q) => {
          const readMethods = [...READ_METHODS];
          const method = readMethods[Math.abs(q.line) % readMethods.length];
          const { select: _select, ...rest } = q as QueryRecord & { select?: string };
          void _select;
          return { ...rest, method, select: undefined } as QueryRecord;
        }),
        (query) => {
          const suggestions = computeSuggestions(query);
          return suggestions.some(
            (s) =>
              s.severity === 'warning' &&
              s.message.toLowerCase().includes('select')
          );
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe('Property 10: No false positives for well-formed queries', () => {
  /**
   * Validates: Requirements 5.7
   *
   * For any QueryRecord where isInLoop === false, method is a read method,
   * select is defined, where is defined, take is defined (for findMany),
   * include is undefined, and method is not a raw method,
   * computeSuggestions(query) SHALL return an empty array.
   */
  it('returns no suggestions for well-formed read queries', () => {
    fc.assert(
      fc.property(arbWellFormedReadQuery, (query) => {
        const suggestions = computeSuggestions(query);
        return suggestions.length === 0;
      }),
      { numRuns: 200 }
    );
  });
});
