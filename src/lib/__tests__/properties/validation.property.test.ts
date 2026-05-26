// Feature: query-lens-react-flow-ui, Property 16: Input validation rejects empty function name or file path

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { validateAnalyzeParams } from '../../validation';
import { arbAnalyzeParams, arbInvalidAnalyzeParams } from './arbitraries';

describe('Property 16: Input validation rejects empty function name or file path', () => {
  /**
   * Validates: Requirements 6.6
   *
   * For any AnalyzeParams where functionName.trim() === '' or filePath.trim() === '',
   * the validation function SHALL return a non-null error string.
   */

  it('returns a non-null error string for any params with empty functionName or filePath', () => {
    fc.assert(
      fc.property(arbInvalidAnalyzeParams, (params) => {
        const result = validateAnalyzeParams(params);
        return result !== null && typeof result === 'string' && result.length > 0;
      }),
      { numRuns: 200 }
    );
  });

  it('returns null for valid params with non-empty functionName and filePath', () => {
    fc.assert(
      fc.property(
        arbAnalyzeParams.filter(
          (p) => p.functionName.trim() !== '' && p.filePath.trim() !== ''
        ),
        (params) => {
          const result = validateAnalyzeParams(params);
          return result === null;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('rejects whitespace-only functionName', () => {
    fc.assert(
      fc.property(
        fc.record({
          functionName: fc.constantFrom('', ' ', '  ', '\t', '\n', '   '),
          filePath: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim() !== ''),
          workspaceRoot: fc.string({ minLength: 0, maxLength: 100 }),
        }),
        (params) => {
          const result = validateAnalyzeParams(params);
          return result !== null;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects whitespace-only filePath', () => {
    fc.assert(
      fc.property(
        fc.record({
          functionName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim() !== ''),
          filePath: fc.constantFrom('', ' ', '  ', '\t', '\n', '   '),
          workspaceRoot: fc.string({ minLength: 0, maxLength: 100 }),
        }),
        (params) => {
          const result = validateAnalyzeParams(params);
          return result !== null;
        }
      ),
      { numRuns: 100 }
    );
  });
});
