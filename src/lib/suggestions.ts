import type { QueryRecord, Suggestion } from '../types';
import { isReadMethod } from './operationType';

export function computeSuggestions(query: QueryRecord): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (query.isInLoop) {
    suggestions.push({
      severity: 'error',
      message: "N+1 query detected: this query runs inside a loop. Batch with `findMany` + `in` filter or use `Promise.all`.",
    });
  }

  if (query.method === '$queryRaw' || query.method === '$queryRawUnsafe') {
    suggestions.push({
      severity: 'error',
      message: "Raw query detected: `$queryRawUnsafe` is vulnerable to SQL injection. Use parameterized `$queryRaw` with tagged template literals.",
    });
  }

  if (!query.where && isReadMethod(query.method)) {
    suggestions.push({
      severity: 'warning',
      message: "No `where` clause: this query may perform a full table scan. Add a `where` filter to limit results.",
    });
  }

  if (query.method === 'findMany' && query.take === undefined) {
    suggestions.push({
      severity: 'warning',
      message: "Unbounded `findMany`: no `take` limit set. Add `take` and `skip` for pagination to avoid large result sets.",
    });
  }

  if (!query.select && isReadMethod(query.method)) {
    suggestions.push({
      severity: 'warning',
      message: "No `select` clause: all columns are fetched. Add a `select` to retrieve only the fields you need.",
    });
  }

  if (query.include !== undefined) {
    suggestions.push({
      severity: 'info',
      message: "Eager loading via `include` detected. Verify all included relations are used; consider `select` with nested fields for finer control.",
    });
  }

  return suggestions;
}
