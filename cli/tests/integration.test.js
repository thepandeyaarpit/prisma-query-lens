'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Task 9.1 — --help flag exits cleanly with usage text
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------

describe('Integration: --help flag', () => {
  it('exits with code 0 and prints usage text containing --cli and query-lens', () => {
    const result = spawnSync('node', ['bin/start.js', '--help'], {
      cwd: path.join(__dirname, '../..'),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('--cli'));
    assert.ok(result.stdout.includes('query-lens'));
  });
});

// ---------------------------------------------------------------------------
// Task 9.2 — --cli starts and exits cleanly with piped `exit\n`
// Validates: Requirements 1.4, 2.4
// ---------------------------------------------------------------------------

describe('Integration: --cli mode startup and exit', () => {
  it('exits with code 0 and prints the welcome banner when given "exit\\n" on stdin', () => {
    const result = spawnSync('node', ['bin/start.js', '--cli'], {
      cwd: path.join(__dirname, '../..'),
      input: 'exit\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Query Lens CLI'));
  });
});

// ---------------------------------------------------------------------------
// Task 9.3 — --cli with `help\nexit\n` shows help text
// Validates: Requirements 1.4, 2.4
// ---------------------------------------------------------------------------

describe('Integration: --cli help command', () => {
  it('shows help text containing "show queries" when "help\\nexit\\n" is piped to stdin', () => {
    const result = spawnSync('node', ['bin/start.js', '--cli'], {
      cwd: path.join(__dirname, '../..'),
      input: 'help\nexit\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('show queries'));
  });
});

// ---------------------------------------------------------------------------
// Task 9.4 — --cli with unknown command shows error
// Validates: Requirements 2.4
// ---------------------------------------------------------------------------

describe('Integration: --cli unknown command', () => {
  it('shows "Unknown command" when an unrecognised command is entered', () => {
    const result = spawnSync('node', ['bin/start.js', '--cli'], {
      cwd: path.join(__dirname, '../..'),
      input: 'foobar\nexit\n',
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Unknown command'));
  });
});
