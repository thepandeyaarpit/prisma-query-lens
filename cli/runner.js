'use strict';

const readline = require('node:readline');
const { scan, resolveTsconfig } = require('./scanner');
const { format, ansi, ANSI } = require('./formatter');
const { QueryAnalyzer } = require('../analyzer');
const { QueryOptimizer } = require('./optimizer');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Welcome banner
// ---------------------------------------------------------------------------

const BANNER = `╔════════════════════════════════════════╗
║     🔍  Query Lens CLI  v1.0.3        ║
╠════════════════════════════════════════╣
║  Type "help" for available commands   ║
║  Type "exit" or "quit" to quit        ║
╚════════════════════════════════════════╝`;

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP_TEXT = `Available commands:
  show queries "<term>"              Search by function name, route, or endpoint
  show queries "<term>" in "<file>"  Narrow to a specific file (partial path ok)
  use <number>                       Pick from multiple matches by number
  use query <id> and explain         Break down structural details of query <id>
  use query <id> and optimize        View proposed optimized code and side-by-side diff
  use query <id> and auto-fix        Automatically rewrite query in source file
  use query <id> and benchmark       Analyze performance complexity and indexing recommendations
  help [command]                     Show help for a command
  exit / quit                        Exit the CLI`;

const HELP_SHOW_QUERIES = `Usage: show queries "<term>" [in "<file>"]

Search the workspace for a function matching <term>, then analyze all
reachable Prisma queries.

When multiple matches are found, you can:
  1. Re-run with a file filter:   show queries "addReservation" in "services"
  2. Pick by number:              use 2

Examples:
  show queries "getUserById"
  show queries "addReservation" in "reservation.services"
  show queries "/users/:id"`;

// ---------------------------------------------------------------------------
// State for session & multi-match selection
// ---------------------------------------------------------------------------

let _pendingMatches = null;
let _pendingOptions = null;

let _session = {
  root: '',
  tsconfig: undefined,
  lastScannedFunction: '',
  lastScannedFilePath: '',
  queries: []
};

// ---------------------------------------------------------------------------
// handleShowQueries
// ---------------------------------------------------------------------------

/**
 * Handle the `show queries "<term>"` command.
 * Supports optional file filter: show queries "term" in "file"
 *
 * @param {string} term
 * @param {string|null} fileFilter  - optional partial file path to narrow matches
 * @param {{ json: boolean, noColor: boolean, root: string, tsconfig: string|undefined }} options
 */
function handleShowQueries(term, fileFilter, options) {
  let matches = scan(term, options.root);

  // Apply file filter if provided
  if (fileFilter) {
    const filter = fileFilter.toLowerCase().replace(/\\/g, '/');
    matches = matches.filter(m => m.filePath.toLowerCase().replace(/\\/g, '/').includes(filter));
  }

  if (matches.length === 0) {
    if (fileFilter) {
      console.log(`No matches found for "${term}" in files matching "${fileFilter}".`);
      console.log(`Try without the file filter: show queries "${term}"`);
    } else {
      console.log(`No matches found for "${term}". Verify the function name and workspace root: ${options.root}`);
    }
    return;
  }

  if (matches.length > 1) {
    console.log(`\nMultiple matches found for "${term}". Pick one:\n`);
    matches.forEach((match, i) => {
      const rel = match.filePath.replace(options.root, '').replace(/^[\\/]/, '');
      console.log(`  ${i + 1}.  ${match.functionName}  —  ${rel}`);
    });
    console.log(`\nRun:  use <number>   e.g. use 4`);
    console.log(`  or:  show queries "${term}" in "services"  (partial file filter)`);
    // Store pending matches for `use <n>` command
    _pendingMatches = matches;
    _pendingOptions = options;
    return;
  }

  runAnalysis(matches[0], options);
}

/**
 * Run the analyzer on a single match and print results.
 */
function runAnalysis(match, options) {
  const tsconfigPath = resolveTsconfig(options.root, match.filePath, options.tsconfig);
  const analyzer = new QueryAnalyzer(options.root, tsconfigPath);

  console.log(`\n⏳ Analyzing ${match.functionName} in ${match.filePath.replace(options.root, '').replace(/^[\\/]/, '')}...\n`);

  const result = analyzer.analyze(match.functionName, match.filePath);

  // Save parsed queries and environment to the stateful session
  _session.root = options.root;
  _session.tsconfig = tsconfigPath;
  _session.lastScannedFunction = match.functionName;
  _session.lastScannedFilePath = match.filePath;
  _session.queries = result.queries || [];

  console.log(format(result, { json: options.json, noColor: options.noColor }));
}

// ---------------------------------------------------------------------------
// Interactive Command Handlers
// ---------------------------------------------------------------------------

function getSessionQuery(idStr) {
  const id = parseInt(idStr, 10);
  if (!_session.queries || _session.queries.length === 0) {
    throw new Error("No queries scanned in the current session. Run 'show queries' first.");
  }
  if (isNaN(id) || id < 1 || id > _session.queries.length) {
    throw new Error(`Invalid query ID. Please select a query index between 1 and ${_session.queries.length}.`);
  }
  return _session.queries[id - 1];
}

function handleUseExplain(idStr, options) {
  const query = getSessionQuery(idStr);
  const noColor = options.noColor;

  console.log(ansi(`\n🔍 Detailed AST breakdown for Query [${idStr}]`, ANSI.boldCyan, noColor));
  console.log('═'.repeat(60));
  console.log(`  Target Model:      ${query.model}`);
  console.log(`  Prisma Method:     ${query.method}`);
  console.log(`  Location:          line ${query.line} in ${query.filePath}`);
  console.log(`  Full File Path:    ${query.fullFilePath}`);
  console.log(`  Called From:       ${query.calledFrom} (depth: ${query.callDepth})`);
  console.log(`  Is Inside Loop:    ${query.isInLoop ? ansi('YES (N+1 Risk)', ANSI.yellow, noColor) : 'NO'}`);
  
  console.log('\n  Query Clause Details:');
  console.log(`    Where:           ${query.where || 'None'}`);
  console.log(`    Select:          ${query.select || 'All Fields (*)'}`);
  console.log(`    Include:         ${query.include || 'None'}`);
  console.log(`    Order By:        ${query.orderBy || 'None'}`);
  console.log(`    Limits / Offset: take: ${query.take !== undefined ? query.take : 'Unbounded'}, skip: ${query.skip !== undefined ? query.skip : 'None'}`);

  console.log('\n  Generated SQL Execution Plan:');
  const sqlLines = (query.sql || '').split('\n');
  for (const line of sqlLines) {
    console.log(`    ${line}`);
  }
  console.log('═'.repeat(60));
}

async function handleUseOptimize(idStr, options) {
  const query = getSessionQuery(idStr);
  const optimizer = new QueryOptimizer(_session.root, _session.tsconfig);
  const noColor = options.noColor;

  console.log(ansi(`\n🔍 Analyzing optimizations for Query [${idStr}] (${query.model}.${query.method})`, ANSI.boldCyan, noColor));
  console.log('─'.repeat(60));

  const result = await optimizer.optimize(query, query.fullFilePath);
  
  if (result.explanation.length === 0) {
    console.log(ansi("  ✅ AST query code is already optimized! No changes proposed.", ANSI.green, noColor));
    return;
  }

  console.log(ansi("Proposed AST Optimizations:", ANSI.bold, noColor));
  result.explanation.forEach(point => console.log(`  ${point}`));

  console.log(ansi("\n------------------- BEFORE vs AFTER COMPARISON -------------------", ANSI.bold, noColor));
  console.log(result.diff);
  console.log(ansi("------------------------------------------------------------------", ANSI.bold, noColor));
  
  console.log(ansi(`\nRun 'use query ${idStr} and auto-fix' to save this rewrite directly to the file.`, ANSI.bold, noColor));
}

async function handleUseAutofix(idStr, options) {
  const query = getSessionQuery(idStr);
  const optimizer = new QueryOptimizer(_session.root, _session.tsconfig);
  const noColor = options.noColor;

  console.log(ansi(`\n⏳ Auto-fixing Query [${idStr}] in file: ${query.filePath}...`, ANSI.boldCyan, noColor));
  
  await optimizer.autofix(query, query.fullFilePath);
  
  console.log(ansi(`\n✅ SUCCESS: Query [${idStr}] has been successfully optimized and saved back to disk!`, ANSI.green, noColor));
}

function handleUseBenchmark(idStr, options) {
  const query = getSessionQuery(idStr);
  const noColor = options.noColor;

  console.log(ansi(`\n📈 Performance Complexity & Indexing Recommendations [${idStr}]`, ANSI.boldCyan, noColor));
  console.log('═'.repeat(60));

  let score = 0;
  const analysis = [];

  // Index complexity scores
  if (query.isInLoop) {
    score += 8;
    analysis.push(`- [CRITICAL] Query runs inside a loop. Run frequency scaling is linear O(N) database roundtrips.`);
  } else {
    analysis.push(`- [GOOD] Query scales O(1) in a single invocation path.`);
  }

  if (!query.select && !query.include) {
    score += 2;
    analysis.push(`- [WARNING] Fetching all columns (*) increases memory mapping overhead.`);
  }

  if (query.method === 'findMany' && query.take === undefined) {
    score += 4;
    analysis.push(`- [WARNING] Unbounded findMany can load thousands of records under heavy scale.`);
  }

  if (query.include) {
    const joins = (query.include.match(/:/g) || []).length;
    if (joins > 2) {
      score += 3;
      analysis.push(`- [WARNING] Database query contains ${joins} structural joins. High join complexity slows reads.`);
    }
  }

  // Draw rating
  let rating = ansi('LOW RISK (Excellent)', ANSI.green, noColor);
  if (score >= 10) rating = ansi('CRITICAL RISK (Red Alert)', ANSI.red, noColor);
  else if (score >= 5) rating = ansi('MEDIUM / HIGH RISK (Needs optimization)', ANSI.yellow, noColor);

  console.log(`  Estimated Scale Risk Rating:  ${rating}`);
  console.log('\n  Risk Evaluation:');
  analysis.forEach(a => console.log(`    ${a}`));

  // Index recommendations based on where clauses
  if (query.where) {
    console.log(ansi('\n  Database Indexing Recommendations:', ANSI.bold, noColor));
    const columns = [];
    const matches = query.where.matchAll(/(\w+)\s*:/g);
    for (const match of matches) {
      if (!columns.includes(match[1])) columns.push(match[1]);
    }
    
    if (columns.length > 0) {
      console.log(`    Ensure indexes exist on table "${query.model.toLowerCase()}" for:`);
      columns.forEach(col => {
        console.log(`      - Index: CREATE INDEX idx_${query.model.toLowerCase()}_${col} ON ${query.model.toLowerCase()}(${col});`);
      });
    } else {
      console.log('    No complex filtering keys detected in WHERE clause.');
    }
  }

  console.log('═'.repeat(60));
}

// ---------------------------------------------------------------------------
// Command dispatch
// ---------------------------------------------------------------------------

/**
 * Parse and dispatch a single input line.
 */
async function dispatch(line, rl, options) {
  const trimmed = line.trim();

  if (trimmed === '') return;

  if (trimmed === 'exit' || trimmed === 'quit') {
    rl.close();
    process.exit(0);
  }

  if (trimmed === 'help show queries') {
    console.log(HELP_SHOW_QUERIES);
    return;
  }

  if (trimmed === 'help') {
    console.log(HELP_TEXT);
    return;
  }

  // Pick from pending multiple matches by index
  const useMatch = trimmed.match(/^use\s+(\d+)$/);
  if (useMatch) {
    const idx = parseInt(useMatch[1], 10) - 1;
    if (!_pendingMatches || _pendingMatches.length === 0) {
      console.log('No pending matches. Run show queries first.');
      return;
    }
    if (idx < 0 || idx >= _pendingMatches.length) {
      console.log(`Invalid number. Pick between 1 and ${_pendingMatches.length}.`);
      return;
    }
    const match = _pendingMatches[idx];
    const opts = _pendingOptions;
    _pendingMatches = null;
    _pendingOptions = null;
    runAnalysis(match, opts);
    return;
  }

  // show queries "<term>" [in "<file>"]
  const showQueriesMatch = trimmed.match(/^show queries\s+(['"])(.*?)\1(?:\s+in\s+(['"]?)(.+?)\3)?\s*$/i);
  if (showQueriesMatch) {
    const term = showQueriesMatch[2];
    const fileFilter = showQueriesMatch[4] || null;
    handleShowQueries(term, fileFilter, options);
    return;
  }

  // use query <id> and explain
  const useExplainMatch = trimmed.match(/^use query\s+(\d+)\s+and\s+explain$/i);
  if (useExplainMatch) {
    handleUseExplain(useExplainMatch[1], options);
    return;
  }

  // use query <id> and optimize
  const useOptimizeMatch = trimmed.match(/^use query\s+(\d+)\s+and\s+optimize$/i);
  if (useOptimizeMatch) {
    await handleUseOptimize(useOptimizeMatch[1], options);
    return;
  }

  // use query <id> and auto-fix / autofix
  const useAutofixMatch = trimmed.match(/^use query\s+(\d+)\s+and\s+(?:auto-fix|autofix)$/i);
  if (useAutofixMatch) {
    await handleUseAutofix(useAutofixMatch[1], options);
    return;
  }

  // use query <id> and benchmark
  const useBenchmarkMatch = trimmed.match(/^use query\s+(\d+)\s+and\s+benchmark$/i);
  if (useBenchmarkMatch) {
    handleUseBenchmark(useBenchmarkMatch[1], options);
    return;
  }

  console.log("Unknown command. Type 'help' for available commands.");
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

/**
 * Start the interactive CLI REPL.
 */
function start(options) {
  console.log(BANNER);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'query-lens> ',
  });

  process.on('SIGINT', () => {
    rl.close();
    process.exit(0);
  });

  rl.on('close', () => {
    process.exit(0);
  });

  rl.prompt();

  rl.on('line', async (line) => {
    try {
      await dispatch(line, rl, options);
    } catch (err) {
      console.error(err && err.message ? err.message : String(err));
    }
    rl.prompt();
  });
}

module.exports = { start };
