'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { format, formatQuery } = require('../formatter.js');

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a safe non-empty string that won't accidentally match ANSI patterns */
const safeStringArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0 && !s.includes('\x1b'));

/** Generate a valid identifier-like string (no special chars that break assertions) */
const identArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/);

/** Generate a Query_Result object */
const queryResultArb = fc.record({
  model: identArb,
  method: fc.constantFrom('findUnique', 'findMany', 'create', 'update', 'delete', 'upsert'),
  line: fc.integer({ min: 1, max: 9999 }),
  filePath: fc
    .tuple(identArb, identArb)
    .map(([a, b]) => `${a}.service.ts`),
  fullFilePath: fc
    .tuple(identArb, identArb)
    .map(([a, b]) => `/workspace/src/${a}.service.ts`),
  calledFrom: identArb,
  callDepth: fc.integer({ min: 0, max: 5 }),
  isInLoop: fc.boolean(),
  clientAlias: fc.constant('prisma'),
  sql: fc.string({ minLength: 5, maxLength: 100 }).filter((s) => !s.includes('\x1b')),
  where: fc.option(safeStringArb, { nil: undefined }),
  select: fc.option(safeStringArb, { nil: undefined }),
  include: fc.option(safeStringArb, { nil: undefined }),
  orderBy: fc.option(safeStringArb, { nil: undefined }),
  take: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  skip: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
});

/** Generate an Analysis_Result with 1–10 queries */
const analysisResultArb = fc
  .integer({ min: 1, max: 10 })
  .chain((n) =>
    fc.record({
      functionName: identArb,
      filePath: fc.tuple(identArb, identArb).map(([a]) => `src/services/${a}.service.ts`),
      totalQueries: fc.constant(n),
      queries: fc.array(queryResultArb, { minLength: n, maxLength: n }),
      errors: fc.array(safeStringArb, { minLength: 0, maxLength: 3 }),
      callChain: fc.array(identArb, { minLength: 1, maxLength: 5 }),
    })
  );

/** Generate an Analysis_Result with any number of queries (0–10) */
const analysisResultAnyArb = fc
  .integer({ min: 0, max: 10 })
  .chain((n) =>
    fc.record({
      functionName: identArb,
      filePath: fc.tuple(identArb, identArb).map(([a]) => `src/services/${a}.service.ts`),
      totalQueries: fc.constant(n),
      queries: fc.array(queryResultArb, { minLength: n, maxLength: n }),
      errors: fc.array(safeStringArb, { minLength: 0, maxLength: 3 }),
      callChain: fc.array(identArb, { minLength: 0, maxLength: 5 }),
    })
  );

// ---------------------------------------------------------------------------
// Property 3: Formatter output contains all required fields
// Feature: query-lens-cli-mode, Property 3: formatter output contains all required fields
// Validates: Requirements 3.3, 3.5, 5.1, 5.3, 5.4
// ---------------------------------------------------------------------------

describe('Property 3: formatter output contains all required fields', () => {
  it('formatted string contains model, method, line, filePath for every query; every error; every callChain name; every present clause label', () => {
    fc.assert(
      fc.property(analysisResultArb, (result) => {
        const output = format(result, { json: false, noColor: true });

        // Every query's fields must appear
        for (const query of result.queries) {
          assert.ok(
            output.includes(query.model),
            `output should contain model "${query.model}"`
          );
          assert.ok(
            output.includes(query.method),
            `output should contain method "${query.method}"`
          );
          assert.ok(
            output.includes(String(query.line)),
            `output should contain line "${query.line}"`
          );
          assert.ok(
            output.includes(query.filePath),
            `output should contain filePath "${query.filePath}"`
          );

          // Clause labels
          if (query.where !== undefined) {
            assert.ok(output.includes('Where:'), 'output should contain "Where:" label');
          }
          if (query.select !== undefined) {
            assert.ok(output.includes('Select:'), 'output should contain "Select:" label');
          }
          if (query.include !== undefined) {
            assert.ok(output.includes('Include:'), 'output should contain "Include:" label');
          }
          if (query.orderBy !== undefined) {
            assert.ok(output.includes('Order By:'), 'output should contain "Order By:" label');
          }
        }

        // Every error string must appear
        for (const err of result.errors) {
          assert.ok(output.includes(err), `output should contain error "${err}"`);
        }

        // Every callChain name must appear
        for (const name of result.callChain) {
          assert.ok(output.includes(name), `output should contain callChain name "${name}"`);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Loop-risk warning count matches in-loop query count
// Feature: query-lens-cli-mode, Property 4: loop-risk warning count matches in-loop query count
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------

describe('Property 4: loop-risk warning count matches in-loop query count', () => {
  it('count of "IN LOOP" in output equals count of queries with isInLoop === true', () => {
    fc.assert(
      fc.property(analysisResultArb, (result) => {
        const output = format(result, { json: false, noColor: true });

        const expectedCount = result.queries.filter((q) => q.isInLoop).length;

        // Count occurrences of "IN LOOP" in the output
        const matches = output.match(/IN LOOP/g);
        const actualCount = matches ? matches.length : 0;

        assert.equal(
          actualCount,
          expectedCount,
          `expected ${expectedCount} "IN LOOP" occurrences but found ${actualCount}`
        );
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: JSON output round-trip
// Feature: query-lens-cli-mode, Property 5: JSON output round-trip
// Validates: Requirements 5.5
// ---------------------------------------------------------------------------

describe('Property 5: JSON output round-trip', () => {
  it('JSON.parse(format(result, {json:true, noColor:true})) deep-equals result', () => {
    fc.assert(
      fc.property(analysisResultAnyArb, (result) => {
        const output = format(result, { json: true, noColor: true });
        const parsed = JSON.parse(output);
        // JSON.stringify drops undefined values, so we compare against the
        // JSON-serialized form of the original (which also drops undefined).
        // This verifies a true round-trip: serialize → parse → same structure.
        const expected = JSON.parse(JSON.stringify(result));
        assert.deepEqual(parsed, expected, 'round-tripped JSON should deep-equal original result');
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: No-color output contains no ANSI escape codes
// Feature: query-lens-cli-mode, Property 6: no-color output contains no ANSI escape codes
// Validates: Requirements 5.6
// ---------------------------------------------------------------------------

describe('Property 6: no-color output contains no ANSI escape codes', () => {
  it('format(result, {json:false, noColor:true}) does not match /\\x1b\\[[\\d;]*m/', () => {
    fc.assert(
      fc.property(analysisResultAnyArb, (result) => {
        const output = format(result, { json: false, noColor: true });
        const ansiPattern = /\x1b\[[\d;]*m/;
        assert.ok(
          !ansiPattern.test(output),
          'no-color output should not contain ANSI escape codes'
        );
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests: specific examples
// ---------------------------------------------------------------------------

describe('Unit tests: formatter.js specific examples', () => {
  // Helper to build a minimal Analysis_Result
  function makeResult(overrides = {}) {
    return {
      functionName: 'getUserById',
      filePath: 'src/services/user.service.ts',
      totalQueries: 0,
      queries: [],
      errors: [],
      callChain: ['getUserById'],
      ...overrides,
    };
  }

  function makeQuery(overrides = {}) {
    return {
      model: 'user',
      method: 'findUnique',
      line: 42,
      filePath: 'user.service.ts',
      fullFilePath: '/workspace/src/user.service.ts',
      calledFrom: 'getUserById',
      callDepth: 0,
      isInLoop: false,
      clientAlias: 'prisma',
      sql: 'SELECT * FROM user WHERE id = userId;',
      ...overrides,
    };
  }

  it('zero queries → output contains "no Prisma queries"', () => {
    const result = makeResult({ totalQueries: 0, queries: [] });
    const output = format(result, { json: false, noColor: true });
    assert.ok(
      output.toLowerCase().includes('no prisma queries'),
      `expected "no Prisma queries" in output, got:\n${output}`
    );
  });

  it('one query with isInLoop: true → output contains "IN LOOP"', () => {
    const query = makeQuery({ isInLoop: true });
    const result = makeResult({ totalQueries: 1, queries: [query] });
    const output = format(result, { json: false, noColor: true });
    assert.ok(output.includes('IN LOOP'), `expected "IN LOOP" in output, got:\n${output}`);
  });

  it('--json mode → JSON.parse(output) deep-equals input result', () => {
    const query = makeQuery();
    const result = makeResult({ totalQueries: 1, queries: [query] });
    const output = format(result, { json: true, noColor: true });
    const parsed = JSON.parse(output);
    // JSON.stringify drops undefined fields; compare against the serialized form
    assert.deepEqual(parsed, JSON.parse(JSON.stringify(result)));
  });

  it('--no-color → no ANSI codes in output', () => {
    const query = makeQuery({ isInLoop: true });
    const result = makeResult({ totalQueries: 1, queries: [query] });
    const output = format(result, { json: false, noColor: true });
    const ansiPattern = /\x1b\[[\d;]*m/;
    assert.ok(!ansiPattern.test(output), 'output should not contain ANSI codes');
  });

  it('query with where, select, include clauses → each clause label appears in output', () => {
    const query = makeQuery({
      where: '{ id: userId }',
      select: '{ id: true, name: true }',
      include: '{ posts: true }',
    });
    const result = makeResult({ totalQueries: 1, queries: [query] });
    const output = format(result, { json: false, noColor: true });
    assert.ok(output.includes('Where:'), 'output should contain "Where:"');
    assert.ok(output.includes('Select:'), 'output should contain "Select:"');
    assert.ok(output.includes('Include:'), 'output should contain "Include:"');
  });

  it('query with orderBy clause → "Order By:" label appears in output', () => {
    const query = makeQuery({ orderBy: '{ createdAt: "desc" }' });
    const result = makeResult({ totalQueries: 1, queries: [query] });
    const output = format(result, { json: false, noColor: true });
    assert.ok(output.includes('Order By:'), 'output should contain "Order By:"');
  });

  it('errors are rendered at the end of output', () => {
    const result = makeResult({
      errors: ['Type error in user.service.ts', 'Cannot find module'],
    });
    const output = format(result, { json: false, noColor: true });
    assert.ok(output.includes('Type error in user.service.ts'));
    assert.ok(output.includes('Cannot find module'));
  });

  it('no errors → output contains "Errors: none"', () => {
    const result = makeResult({ errors: [] });
    const output = format(result, { json: false, noColor: true });
    assert.ok(output.includes('Errors: none'));
  });

  it('call chain is rendered with → separator', () => {
    const result = makeResult({
      callChain: ['getUserById', 'findUserWithPosts', 'getUserById'],
    });
    const output = format(result, { json: false, noColor: true });
    assert.ok(output.includes('getUserById → findUserWithPosts → getUserById'));
  });

  it('with color enabled, output contains ANSI escape codes', () => {
    const query = makeQuery({ isInLoop: true });
    const result = makeResult({ totalQueries: 1, queries: [query] });
    const output = format(result, { json: false, noColor: false });
    const ansiPattern = /\x1b\[[\d;]*m/;
    assert.ok(ansiPattern.test(output), 'colored output should contain ANSI codes');
  });

  it('formatQuery renders model, method, line, filePath', () => {
    const query = makeQuery();
    const output = formatQuery(query, 0, { noColor: true }, 1);
    assert.ok(output.includes('user'));
    assert.ok(output.includes('findUnique'));
    assert.ok(output.includes('42'));
    assert.ok(output.includes('user.service.ts'));
  });

  it('formatQuery with isInLoop: true includes IN LOOP', () => {
    const query = makeQuery({ isInLoop: true });
    const output = formatQuery(query, 0, { noColor: true }, 1);
    assert.ok(output.includes('IN LOOP'));
  });

  it('formatQuery without isInLoop does not include IN LOOP', () => {
    const query = makeQuery({ isInLoop: false });
    const output = formatQuery(query, 0, { noColor: true }, 1);
    assert.ok(!output.includes('IN LOOP'));
  });
});

// ---------------------------------------------------------------------------
// NO_COLOR env var tests
// ---------------------------------------------------------------------------

describe('NO_COLOR environment variable', () => {
  let originalNoColor;

  beforeEach(() => {
    originalNoColor = process.env.NO_COLOR;
  });

  afterEach(() => {
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
  });

  it('when NO_COLOR env var is set, output contains no ANSI codes even with noColor: false', () => {
    process.env.NO_COLOR = '1';
    const result = {
      functionName: 'test',
      filePath: 'test.ts',
      totalQueries: 0,
      queries: [],
      errors: [],
      callChain: ['test'],
    };
    const output = format(result, { json: false, noColor: false });
    const ansiPattern = /\x1b\[[\d;]*m/;
    assert.ok(!ansiPattern.test(output), 'NO_COLOR env var should suppress ANSI codes');
  });
});
