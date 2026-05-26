// Feature: query-lens-react-flow-ui, Property 5: Collapse hides all descendants

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { filterCollapsedNodes } from '../../filterCollapsed';
import type { Node, Edge } from 'reactflow';

/**
 * Generates a simple tree graph with known parent-child relationships.
 * Structure: root -> [child1, child2], child1 -> [grandchild1], child2 -> [grandchild2]
 */
const arbTreeGraph: fc.Arbitrary<{ nodes: Node[]; edges: Edge[]; parentId: string; childIds: string[]; grandchildIds: string[] }> = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
    fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
    fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
    fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
    fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
  )
  .filter(([a, b, c, d, e]) => new Set([a, b, c, d, e]).size === 5)
  .map(([root, c1, c2, gc1, gc2]) => {
    const nodes: Node[] = [
      { id: root, type: 'functionNode', position: { x: 0, y: 0 }, data: {} },
      { id: c1, type: 'functionNode', position: { x: 0, y: 0 }, data: {} },
      { id: c2, type: 'functionNode', position: { x: 0, y: 0 }, data: {} },
      { id: gc1, type: 'queryNode', position: { x: 0, y: 0 }, data: {} },
      { id: gc2, type: 'queryNode', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: `e1`, source: root, target: c1 },
      { id: `e2`, source: root, target: c2 },
      { id: `e3`, source: c1, target: gc1 },
      { id: `e4`, source: c2, target: gc2 },
    ];
    return {
      nodes,
      edges,
      parentId: root,
      childIds: [c1, c2],
      grandchildIds: [gc1, gc2],
    };
  });

describe('Property 5: Collapse hides all descendants', () => {
  /**
   * Validates: Requirements 2.5, 2.6
   *
   * For any graph (nodes + edges) and any set of collapsed function node IDs,
   * calling filterCollapsedNodes(nodes, edges, collapsedIds) SHALL return a
   * nodes array that contains none of the descendant nodes of any collapsed node.
   */

  it('no descendant of a collapsed node appears in the output', () => {
    fc.assert(
      fc.property(arbTreeGraph, ({ nodes, edges, parentId, childIds, grandchildIds }) => {
        const collapsedIds = new Set([parentId]);
        const { nodes: visibleNodes } = filterCollapsedNodes(nodes, edges, collapsedIds);

        const visibleIds = new Set(visibleNodes.map((n) => n.id));

        // All children and grandchildren should be hidden
        const allDescendants = [...childIds, ...grandchildIds];
        return allDescendants.every((id) => !visibleIds.has(id));
      }),
      { numRuns: 200 }
    );
  });

  it('collapsed node itself remains visible', () => {
    fc.assert(
      fc.property(arbTreeGraph, ({ nodes, edges, parentId }) => {
        const collapsedIds = new Set([parentId]);
        const { nodes: visibleNodes } = filterCollapsedNodes(nodes, edges, collapsedIds);
        return visibleNodes.some((n) => n.id === parentId);
      }),
      { numRuns: 200 }
    );
  });

  it('returns all nodes unchanged when collapsedIds is empty', () => {
    fc.assert(
      fc.property(arbTreeGraph, ({ nodes, edges }) => {
        const { nodes: visibleNodes, edges: visibleEdges } = filterCollapsedNodes(
          nodes,
          edges,
          new Set()
        );
        return visibleNodes.length === nodes.length && visibleEdges.length === edges.length;
      }),
      { numRuns: 200 }
    );
  });

  it('no edges reference hidden nodes after collapse', () => {
    fc.assert(
      fc.property(arbTreeGraph, ({ nodes, edges, parentId }) => {
        const collapsedIds = new Set([parentId]);
        const { nodes: visibleNodes, edges: visibleEdges } = filterCollapsedNodes(
          nodes,
          edges,
          collapsedIds
        );
        const visibleIds = new Set(visibleNodes.map((n) => n.id));
        return visibleEdges.every(
          (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
        );
      }),
      { numRuns: 200 }
    );
  });
});
