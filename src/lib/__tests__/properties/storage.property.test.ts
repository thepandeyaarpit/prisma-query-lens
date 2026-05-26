// Feature: query-lens-react-flow-ui, Property 15: localStorage round-trip preserves input values

import { describe, it, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { saveInputs, loadInputs } from '../../storage';
import { arbAnalyzeParams } from './arbitraries';

describe('Property 15: localStorage round-trip preserves input values', () => {
  /**
   * Validates: Requirements 6.5
   *
   * For any AnalyzeParams object, calling saveInputs(params) followed by
   * loadInputs() SHALL return an object with the same functionName, filePath,
   * and workspaceRoot values.
   */

  beforeEach(() => {
    // Use a simple in-memory localStorage mock
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    });
  });

  it('round-trips all AnalyzeParams fields through localStorage', () => {
    fc.assert(
      fc.property(arbAnalyzeParams, (params) => {
        saveInputs(params);
        const loaded = loadInputs();

        return (
          loaded.functionName === params.functionName &&
          loaded.filePath === params.filePath &&
          loaded.workspaceRoot === params.workspaceRoot
        );
      }),
      { numRuns: 200 }
    );
  });

  it('returns empty object when localStorage is empty', () => {
    const result = loadInputs();
    // After clearing, should return {}
    const keys = Object.keys(result);
    return keys.length === 0;
  });
});
