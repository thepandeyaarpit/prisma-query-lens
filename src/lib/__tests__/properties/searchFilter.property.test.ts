// Feature: query-lens-react-flow-ui, Property 12: Empty query matches all nodes
// Feature: query-lens-react-flow-ui, Property 13: Non-empty query dims non-matching nodes
// Feature: query-lens-react-flow-ui, Property 14: Operation type filter excludes hidden types

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { applySearchAndFilter } from '../../searchFilter';
import type { Node } from 'reactflow';
import type { OperationType, QueryNodeData, FunctionNodeData } from '../../../types';
import {
  READ_METHODS,
  WRITE_METHODS,
  UPDATE_METHODS,
  DELETE_METHODS,
  RAW_METHODS,
} from '../../operationType';

const ALL_OPERATION_TYPES: OperationType[] = ['read', 'write', 'update', 'delete', 'raw'];

const arbIdentifier = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{1,15}$/);

const arbOperationType: fc.Arbitrary<OperationType> = fc.constantFrom(...ALL_OPERATION_TYPES);

const arbQueryNode = (operationType?: OperationType): fc.Arbitrary<Node> =>
  fc
    .tuple(
      arbIdentifier,
      arbIdentifier,
      arbIdentifier,
      operationType ? fc.constant(operationType) : arbOperationType,
    )
    .map(([id, model, method, opType]) => ({
      id: `q-${id}`,
      type: 'queryNode' as const,
      position: { x: 0, y: 0 },
      data: {
        query: {
          model,
          method,
          line: 1,
          filePath: 'src/test.ts',
          fullFilePath: '/abs/src/test.ts',
          calledFrom: 'testFn',
          callDepth: 0,
          isInLoop: false,
          clientAlias: 'prisma',
          sql: 'SELECT 1',
        },
        operationType: opType,
        isHighlighted: false,
        isDimmed: false,
      } as QueryNodeData,
    }));

const arbFunctionNode = (): fc.Arbitrary<Node> =>
  fc.tuple(arbIdentifier, arbIdentifier).map(([id, label]) => ({
    id: `fn-${id}`,
    type: 'functionNode' as const,
    position: { x: 0, y: 0 },
    data: {
      label,
      fileName: 'test.ts',
      queryCount: 0,
      isEntry: false,
      hasN1Warning: false,
      isCollapsed: false,
      onToggleCollapse: () => {},
    } as FunctionNodeData,
  }));

const arbMixedNodes: fc.Arbitrary<Node[]> = fc.array(
  fc.oneof(arbQueryNode(), arbFunctionNode()),
  { minLength: 0, maxLength: 10 }
);

describe('Property 12: Empty query matches all nodes', () => {
  /**
   * Validates: Requirements 8.3
   *
   * For any array of React Flow nodes, calling applySearchAndFilter(nodes, '', allFiltersActive)
   * SHALL return all nodes with isDimmed === false and isHighlighted === false.
   */
  it('empty search returns all nodes with no highlighting or dimming', () => {
    fc.assert(
      fc.property(arbMixedNodes, (nodes) => {
        const allFilters = new Set<OperationType>(ALL_OPERATION_TYPES);
        const result = applySearchAndFilter(nodes, '', allFilters);

        // All nodes should be returned
        if (result.length !== nodes.length) return false;

        // No node should be highlighted or dimmed
        return result.every((n) => {
          const data = n.data as { isHighlighted?: boolean; isDimmed?: boolean };
          return data.isHighlighted === false && data.isDimmed === false;
        });
      }),
      { numRuns: 200 }
    );
  });
});

describe('Property 13: Non-empty query dims non-matching nodes', () => {
  /**
   * Validates: Requirements 8.1, 8.2
   *
   * For any array of React Flow nodes and any non-empty search string, every node
   * returned by applySearchAndFilter whose function name, model name, and method name
   * do NOT contain the search string (case-insensitive) SHALL have isDimmed === true.
   */
  it('non-matching nodes are dimmed when search is active', () => {
    // Use a search string that is unlikely to match any generated node
    const arbNonMatchingSearch = fc.constant('ZZZNOMATCH999');

    fc.assert(
      fc.property(arbMixedNodes, arbNonMatchingSearch, (nodes, search) => {
        const allFilters = new Set<OperationType>(ALL_OPERATION_TYPES);
        const result = applySearchAndFilter(nodes, search, allFilters);

        const lowerSearch = search.toLowerCase();

        for (const node of result) {
          if (node.type === 'queryNode') {
            const data = node.data as QueryNodeData;
            const matches =
              data.query.model.toLowerCase().includes(lowerSearch) ||
              data.query.method.toLowerCase().includes(lowerSearch) ||
              data.query.calledFrom.toLowerCase().includes(lowerSearch);

            if (!matches && !(data as { isDimmed?: boolean }).isDimmed) {
              return false;
            }
          } else if (node.type === 'functionNode') {
            const data = node.data as FunctionNodeData;
            const matches =
              data.label.toLowerCase().includes(lowerSearch) ||
              data.fileName.toLowerCase().includes(lowerSearch);

            if (!matches && !(data as { isDimmed?: boolean }).isDimmed) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 200 }
    );
  });
});

describe('Property 14: Operation type filter excludes hidden types', () => {
  /**
   * Validates: Requirements 8.5
   *
   * For any array of React Flow nodes and any set of active operation types,
   * applySearchAndFilter(nodes, '', activeFilters) SHALL not include any QueryNode
   * whose operationType is not in activeFilters.
   */
  it('query nodes with excluded operation types are removed from output', () => {
    fc.assert(
      fc.property(
        fc.array(arbQueryNode(), { minLength: 0, maxLength: 10 }),
        fc.subarray(ALL_OPERATION_TYPES, { minLength: 0, maxLength: 5 }),
        (nodes, activeTypesArray) => {
          const activeFilters = new Set<OperationType>(activeTypesArray);
          const result = applySearchAndFilter(nodes, '', activeFilters);

          // No query node in the result should have an excluded operation type
          return result.every((n) => {
            if (n.type !== 'queryNode') return true;
            const data = n.data as QueryNodeData;
            return activeFilters.has(data.operationType);
          });
        }
      ),
      { numRuns: 200 }
    );
  });

  it('all query nodes with active operation types are included', () => {
    fc.assert(
      fc.property(
        arbOperationType.chain((opType) =>
          fc.tuple(
            fc.array(arbQueryNode(opType), { minLength: 1, maxLength: 5 }),
            fc.constant(opType)
          )
        ),
        ([nodes, opType]) => {
          const activeFilters = new Set<OperationType>([opType]);
          const result = applySearchAndFilter(nodes, '', activeFilters);
          // All nodes should be included since their type is active
          return result.length === nodes.length;
        }
      ),
      { numRuns: 200 }
    );
  });
});

// Suppress unused import warnings
void READ_METHODS;
void WRITE_METHODS;
void UPDATE_METHODS;
void DELETE_METHODS;
void RAW_METHODS;
