'use strict';

const { QueryOptimizer } = require('./optimizer');

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  boldCyan: '\x1b[1;36m',
};

/**
 * Wrap text in an ANSI sequence, or return plain text when color is disabled.
 * @param {string} text
 * @param {string} code  - ANSI escape sequence (e.g. ANSI.boldCyan)
 * @param {boolean} noColor
 * @returns {string}
 */
function ansi(text, code, noColor) {
  if (noColor) return text;
  return `${code}${text}${ANSI.reset}`;
}

// ---------------------------------------------------------------------------
// Separator lines
// ---------------------------------------------------------------------------

const DOUBLE_SEP = '═'.repeat(60);
const SINGLE_SEP = '─'.repeat(60);

// ---------------------------------------------------------------------------
// formatQuery — render a single Query_Result as a text block
// ---------------------------------------------------------------------------

/**
 * Format a single Query_Result as a text block with ─ separators.
 *
 * @param {object} query  - Query_Result
 * @param {number} index  - 0-based index
 * @param {{ json: boolean, noColor: boolean }} options
 * @param {number} total  - total number of queries (for "X of Y" label)
 * @returns {string}
 */
function formatQuery(query, index, options, total) {
  const noColor = resolveNoColor(options);
  const lines = [];

  // Header separator
  lines.push(ansi(SINGLE_SEP, ANSI.cyan, noColor));

  // "Query N of M  ⚠ IN LOOP"
  const loopWarning = query.isInLoop
    ? '  ' + ansi('⚠ IN LOOP', ANSI.yellow, noColor)
    : '';
  const totalLabel = total !== undefined ? ` of ${total}` : '';
  lines.push(
    ansi(`  [${index + 1}] Query${totalLabel}${loopWarning}`, ANSI.bold, noColor)
  );

  // Model / Method / Line / File
  lines.push(`  Model:   ${query.model}`);
  lines.push(`  Method:  ${query.method}`);
  lines.push(`  Line:    ${query.line}`);
  lines.push(`  File:    ${query.filePath}`);

  // Closing separator
  lines.push(ansi(SINGLE_SEP, ANSI.cyan, noColor));

  // SQL block
  lines.push('  SQL:');
  const sqlLines = (query.sql || '').split('\n');
  for (const sqlLine of sqlLines) {
    lines.push(`    ${sqlLine}`);
  }

  // Optional clause fields
  if (query.where !== undefined) {
    lines.push('');
    lines.push(`  Where:   ${query.where}`);
  }
  if (query.select !== undefined) {
    lines.push('');
    lines.push(`  Select:  ${query.select}`);
  }
  if (query.include !== undefined) {
    lines.push('');
    lines.push(`  Include: ${query.include}`);
  }
  if (query.orderBy !== undefined) {
    lines.push('');
    lines.push(`  Order By: ${query.orderBy}`);
  }

  // Static suggestions insertion
  const optimizer = new QueryOptimizer();
  const suggestions = optimizer.getSuggestions(query);
  if (suggestions.length > 0) {
    lines.push('');
    lines.push(ansi('  ⚠️  Optimization Suggestions:', ANSI.yellow, noColor));
    for (const sug of suggestions) {
      lines.push(`     - [${sug.rule}] ${sug.message}`);
    }
  } else {
    lines.push('');
    lines.push(ansi('  ✅  Optimization Suggestions:', ANSI.green, noColor));
    lines.push('     - No immediate performance bottlenecks found.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether color should be suppressed.
 * Color is off when options.noColor === true OR process.env.NO_COLOR is set.
 * @param {{ noColor?: boolean }} options
 * @returns {boolean}
 */
function resolveNoColor(options) {
  return !!(options && options.noColor) || process.env.NO_COLOR !== undefined;
}

// ---------------------------------------------------------------------------
// format — main entry point
// ---------------------------------------------------------------------------

/**
 * Format an Analysis_Result as a string.
 *
 * @param {object} result   - Analysis_Result from QueryAnalyzer.analyze()
 * @param {{ json?: boolean, noColor?: boolean }} options
 * @returns {string}
 */
function format(result, options) {
  options = options || {};

  // JSON mode — NDJSON single line
  if (options.json) {
    return JSON.stringify(result);
  }

  const noColor = resolveNoColor(options);
  const lines = [];

  // ── Header block ──────────────────────────────────────────────────────────
  lines.push(ansi(DOUBLE_SEP, ANSI.boldCyan, noColor));
  lines.push(ansi(`  Query Lens — ${result.functionName}`, ANSI.boldCyan, noColor));
  lines.push(ansi(`  File: ${result.filePath}`, ANSI.boldCyan, noColor));
  lines.push(ansi(`  Total queries: ${result.totalQueries}`, ANSI.boldCyan, noColor));
  lines.push(ansi(DOUBLE_SEP, ANSI.boldCyan, noColor));

  // ── Call chain ────────────────────────────────────────────────────────────
  if (result.callChain && result.callChain.length > 0) {
    lines.push('');
    lines.push('Call Chain:');
    lines.push('  ' + result.callChain.join(' → '));
  }

  // ── Zero queries ──────────────────────────────────────────────────────────
  if (result.totalQueries === 0 || !result.queries || result.queries.length === 0) {
    lines.push('');
    lines.push('  No Prisma queries found.');
  } else {
    // ── Each query ──────────────────────────────────────────────────────────
    for (let i = 0; i < result.queries.length; i++) {
      lines.push('');
      lines.push(formatQuery(result.queries[i], i, options, result.queries.length));
    }
  }

  // ── Errors ────────────────────────────────────────────────────────────────
  lines.push('');
  if (!result.errors || result.errors.length === 0) {
    lines.push('Errors: none');
  } else {
    lines.push('Errors:');
    for (const err of result.errors) {
      lines.push(`  ${err}`);
    }
  }

  lines.push('');
  lines.push(ansi(DOUBLE_SEP, ANSI.boldCyan, noColor));

  // Add contextual instructions for interactive commands
  if (result.totalQueries > 0) {
    lines.push('');
    lines.push(ansi('Run Interactive Commands:', ANSI.bold, noColor));
    lines.push('  use query <id> and explain   (View AST structural details)');
    lines.push('  use query <id> and optimize  (Compare suggestions & code diff)');
    lines.push('  use query <id> and auto-fix  (Rewrite code directly in source file)');
    lines.push('  use query <id> and benchmark (Analyse execution & indexing performance)');
  }

  return lines.join('\n');
}

module.exports = { format, formatQuery, ansi, ANSI };
