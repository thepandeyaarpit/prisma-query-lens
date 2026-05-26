#!/usr/bin/env node

'use strict';

const { execSync } = require('child_process');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI routing - Parse flags FIRST to preserve the user's original terminal directory
// ---------------------------------------------------------------------------
const parsed = require('../cli/flags').parse(process.argv.slice(2));

// Load workspace environment variables (.env)
const { loadEnv } = require('../cli/grok');
// 1. Load global configurations from the Query Lens tool folder itself
loadEnv(path.join(__dirname, '..'));
// 2. Load local configurations from the active project workspace
loadEnv(parsed.root);

// Point server.js to the correct location regardless of where the package is installed
process.chdir(path.join(__dirname, '..'));

if (parsed.help) {
  console.log(`Query Lens v1.0.3

Usage:
  query-lens              Start the web UI (default)
  query-lens --cli        Start the interactive CLI mode
  query-lens --help       Show this help message

CLI mode options:
  --root <path>           Set the workspace root (default: current directory)
  --tsconfig <path>       Set the tsconfig path (default: auto-detect)
  --json                  Output results as JSON (CLI mode only)
  --no-color              Disable color output (CLI mode only)`);
  process.exit(0);
}

if (parsed.cli) {
  require('../cli/runner').start(parsed);
} else {
  require('../server.js');
}
