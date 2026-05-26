// Feature: query-lens-react-flow-ui, Property 6: Operation type classification is total and correct

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  getOperationType,
  READ_METHODS,
  WRITE_METHODS,
  UPDATE_METHODS,
  DELETE_METHODS,
  RAW_METHODS,
} from '../../operationType';
import type { OperationType } from '../../../types';

const VALID_OPERATION_TYPES: OperationType[] = ['read', 'write', 'update', 'delete', 'raw'];

describe('Property 6: Operation type classification is total and correct', () => {
  /**
   * Validates: Requirements 3.3
   *
   * For any method string in the known Prisma method set, getOperationType(method)
   * SHALL return the correct OperationType category, and the result SHALL always
   * be one of 'read' | 'write' | 'update' | 'delete' | 'raw'.
   */

  it('always returns a valid OperationType for any string input', () => {
    fc.assert(
      fc.property(fc.string(), (method) => {
        const result = getOperationType(method);
        return VALID_OPERATION_TYPES.includes(result);
      }),
      { numRuns: 200 }
    );
  });

  it('returns "read" for all known read methods', () => {
    fc.assert(
      fc.property(fc.constantFrom(...READ_METHODS), (method) => {
        return getOperationType(method) === 'read';
      })
    );
  });

  it('returns "write" for all known write methods', () => {
    fc.assert(
      fc.property(fc.constantFrom(...WRITE_METHODS), (method) => {
        return getOperationType(method) === 'write';
      })
    );
  });

  it('returns "update" for all known update methods', () => {
    fc.assert(
      fc.property(fc.constantFrom(...UPDATE_METHODS), (method) => {
        return getOperationType(method) === 'update';
      })
    );
  });

  it('returns "delete" for all known delete methods', () => {
    fc.assert(
      fc.property(fc.constantFrom(...DELETE_METHODS), (method) => {
        return getOperationType(method) === 'delete';
      })
    );
  });

  it('returns "raw" for all known raw methods', () => {
    fc.assert(
      fc.property(fc.constantFrom(...RAW_METHODS), (method) => {
        return getOperationType(method) === 'raw';
      })
    );
  });
});
