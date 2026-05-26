'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { parse } = require('../flags.js');

// ---------------------------------------------------------------------------
// Property 1: Flag parsing correctness
// Feature: query-lens-cli-mode, Property 1: flag parsing correctness
// Validates: Requirements 1.1, 1.2, 6.3, 6.4
// ---------------------------------------------------------------------------

describe('Property 1: flag parsing correctness', () => {
  it('for any combination of supported flags, parse() returns the correct ParsedFlags', () => {
    // Arbitraries for each flag
    const boolFlagArb = fc.boolean(); // whether the boolean flag is present
    const pathArb = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter((s) => !s.startsWith('--') && s.trim().length > 0);

    const arb = fc.record({
      includeCli: boolFlagArb,
      includeHelp: boolFlagArb,
      includeJson: boolFlagArb,
      includeNoColor: boolFlagArb,
      rootPath: fc.option(pathArb, { nil: undefined }),
      tsconfigPath: fc.option(pathArb, { nil: undefined }),
    });

    fc.assert(
      fc.property(arb, ({ includeCli, includeHelp, includeJson, includeNoColor, rootPath, tsconfigPath }) => {
        const argv = [];

        if (includeCli) argv.push('--cli');
        if (includeHelp) argv.push('--help');
        if (includeJson) argv.push('--json');
        if (includeNoColor) argv.push('--no-color');
        if (rootPath !== undefined) argv.push('--root', rootPath);
        if (tsconfigPath !== undefined) argv.push('--tsconfig', tsconfigPath);

        const result = parse(argv);

        assert.equal(result.cli, includeCli, `cli should be ${includeCli}`);
        assert.equal(result.help, includeHelp, `help should be ${includeHelp}`);
        assert.equal(result.json, includeJson, `json should be ${includeJson}`);
        assert.equal(result.noColor, includeNoColor, `noColor should be ${includeNoColor}`);
        assert.equal(result.root, rootPath !== undefined ? rootPath : process.cwd(), `root mismatch`);
        assert.equal(result.tsconfig, tsconfigPath !== undefined ? tsconfigPath : undefined, `tsconfig mismatch`);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Unknown flags are ignored
// Feature: query-lens-cli-mode, Property 2: unknown flags are ignored
// Validates: Requirements 1.1, 1.2
// ---------------------------------------------------------------------------

describe('Property 2: unknown flags are ignored', () => {
  it('argv arrays with unknown --foo tokens produce the same result as argv without them', () => {
    // Generate a valid flag name that is NOT in the supported set
    const unknownFlagArb = fc
      .stringMatching(/^[a-z][a-z0-9-]{1,15}$/)
      .filter((s) => !['cli', 'help', 'json', 'no-color', 'root', 'tsconfig'].includes(s))
      .map((s) => `--${s}`);

    // Generate a small set of valid flags to mix in
    const validArgvArb = fc.array(
      fc.oneof(
        fc.constant('--cli'),
        fc.constant('--help'),
        fc.constant('--json'),
        fc.constant('--no-color')
      ),
      { minLength: 0, maxLength: 4 }
    );

    const arb = fc.record({
      validArgv: validArgvArb,
      unknownFlags: fc.array(unknownFlagArb, { minLength: 1, maxLength: 5 }),
    });

    fc.assert(
      fc.property(arb, ({ validArgv, unknownFlags }) => {
        // Deduplicate valid flags (parse handles duplicates fine, but keep it clean)
        const cleanArgv = [...new Set(validArgv)];

        // Insert unknown flags at random positions by appending them
        const mixedArgv = [...cleanArgv, ...unknownFlags];

        const resultClean = parse(cleanArgv);
        const resultMixed = parse(mixedArgv);

        assert.deepEqual(resultMixed, resultClean, 'unknown flags should not change the result');
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Task 2.4: Unit tests for edge cases
// ---------------------------------------------------------------------------

describe('Unit tests: flags.parse() edge cases', () => {
  it("parse(['--cli']) → cli: true, all other fields at defaults", () => {
    const result = parse(['--cli']);
    assert.deepEqual(result, {
      cli: true,
      help: false,
      json: false,
      noColor: false,
      root: process.cwd(),
      tsconfig: undefined,
    });
  });

  it("parse(['--root', '/some/path']) → root === '/some/path'", () => {
    const result = parse(['--root', '/some/path']);
    assert.equal(result.root, '/some/path');
  });

  it("parse(['--no-color']) → noColor === true", () => {
    const result = parse(['--no-color']);
    assert.equal(result.noColor, true);
  });

  it('parse([]) → all defaults', () => {
    const result = parse([]);
    assert.deepEqual(result, {
      cli: false,
      help: false,
      json: false,
      noColor: false,
      root: process.cwd(),
      tsconfig: undefined,
    });
  });

  it("parse(['--foo']) → same as parse([])", () => {
    const resultFoo = parse(['--foo']);
    const resultEmpty = parse([]);
    assert.deepEqual(resultFoo, resultEmpty);
  });

  it("parse(['--tsconfig', '/path/to/tsconfig.json']) → tsconfig set correctly", () => {
    const result = parse(['--tsconfig', '/path/to/tsconfig.json']);
    assert.equal(result.tsconfig, '/path/to/tsconfig.json');
  });

  it('parse with --root at end of argv (no value) → root defaults to process.cwd()', () => {
    const result = parse(['--root']);
    assert.equal(result.root, process.cwd());
  });

  it('parse with --tsconfig at end of argv (no value) → tsconfig remains undefined', () => {
    const result = parse(['--tsconfig']);
    assert.equal(result.tsconfig, undefined);
  });

  it('parse with multiple flags together', () => {
    const result = parse(['--cli', '--json', '--no-color', '--root', '/workspace']);
    assert.deepEqual(result, {
      cli: true,
      help: false,
      json: true,
      noColor: true,
      root: '/workspace',
      tsconfig: undefined,
    });
  });
});
