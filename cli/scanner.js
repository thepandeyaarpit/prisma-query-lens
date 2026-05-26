'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git']);

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);

/**
 * Returns true if the file should be skipped based on its name.
 * @param {string} fileName
 * @returns {boolean}
 */
function shouldSkipFile(fileName) {
  // Skip declaration files
  if (fileName.endsWith('.d.ts')) return true;
  // Skip test files
  if (
    fileName.endsWith('.test.ts') ||
    fileName.endsWith('.test.js') ||
    fileName.endsWith('.test.tsx') ||
    fileName.endsWith('.test.mjs')
  )
    return true;
  // Skip spec files
  if (
    fileName.endsWith('.spec.ts') ||
    fileName.endsWith('.spec.js') ||
    fileName.endsWith('.spec.tsx') ||
    fileName.endsWith('.spec.mjs')
  )
    return true;
  return false;
}

/**
 * Recursively collect all eligible source files under `dir`.
 * @param {string} dir
 * @param {string[]} results
 */
function collectFiles(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_err) {
    // Permission denied or other fs error — skip this directory
    return;
  }

  for (const entry of entries) {
    // Skip excluded directories
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = path.join(dir, entry);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (_err) {
      continue;
    }

    if (stat.isDirectory()) {
      collectFiles(fullPath, results);
    } else if (stat.isFile()) {
      const ext = path.extname(entry);
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;
      if (shouldSkipFile(entry)) continue;
      results.push(fullPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Pattern matching helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the search term looks like a route pattern.
 * @param {string} searchTerm
 * @returns {boolean}
 */
function isRouteTerm(searchTerm) {
  return searchTerm.startsWith('/') || /^\/\w/.test(searchTerm);
}

/**
 * Search a file's text content for function/symbol matches.
 * @param {string} content
 * @param {string} searchTerm
 * @param {string} filePath
 * @returns {import('./scanner').ScanMatch[]}
 */
function searchContent(content, searchTerm, filePath) {
  const matches = [];

  if (isRouteTerm(searchTerm)) {
    // Route search mode
    // Escape special regex chars in the search term for use in patterns
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Express-style: app.get('/path', handler) or router.post('/path', handler)
    // Matches: app.METHOD('route', or router.METHOD('route',
    const expressPattern = new RegExp(
      `(?:app|router)\\.[a-z]+\\(\\s*['"\`]${escaped}['"\`]\\s*,\\s*([A-Za-z_$][A-Za-z0-9_$]*)`,
      'gm'
    );
    let m;
    while ((m = expressPattern.exec(content)) !== null) {
      matches.push({ functionName: m[1], filePath, matchType: 'route' });
    }

    // NestJS decorators: @Get('/path'), @Post('/path'), etc.
    // The handler name is the method defined right after the decorator
    const nestPattern = new RegExp(
      `@(?:Get|Post|Put|Delete|Patch|Options|Head|All)\\(\\s*['"\`]${escaped}['"\`]\\s*\\)`,
      'gm'
    );
    while ((m = nestPattern.exec(content)) !== null) {
      // Look for the method name after the decorator (skip whitespace/newlines)
      const afterDecorator = content.slice(m.index + m[0].length);
      // Match optional access modifiers and async, then the method name
      const methodMatch = afterDecorator.match(
        /^\s*(?:(?:public|private|protected|async|static)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/
      );
      if (methodMatch) {
        matches.push({ functionName: methodMatch[1], filePath, matchType: 'route' });
      }
    }
  } else {
    // Function/symbol search mode
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Named function declarations: function name( or async function name(
    const funcPattern = new RegExp(`(?:async\\s+)?function\\s+${escaped}\\s*\\(`, 'gm');
    if (funcPattern.test(content)) {
      matches.push({ functionName: searchTerm, filePath, matchType: 'function' });
    }

    // Variable declarations: const name = ... => or const name = function
    const varPattern = new RegExp(
      `(?:const|let)\\s+${escaped}\\s*=\\s*(?:async\\s+)?(?:\\([^)]*\\)|[A-Za-z_$][A-Za-z0-9_$]*)\\s*=>|(?:const|let)\\s+${escaped}\\s*=\\s*(?:async\\s+)?function`,
      'gm'
    );
    if (varPattern.test(content)) {
      matches.push({ functionName: searchTerm, filePath, matchType: 'variable' });
    }

    // Method declarations in class bodies: name( or async name(
    // Must not be preceded by 'function' keyword (already caught above)
    const methodPattern = new RegExp(
      `^\\s*(?:(?:public|private|protected|static|override|abstract|async)\\s+)*${escaped}\\s*\\(`,
      'gm'
    );
    if (methodPattern.test(content)) {
      // Avoid double-counting if already matched as function
      const alreadyFunction = matches.some(
        (m) => m.functionName === searchTerm && m.matchType === 'function'
      );
      if (!alreadyFunction) {
        matches.push({ functionName: searchTerm, filePath, matchType: 'method' });
      }
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {{ functionName: string, filePath: string, matchType: 'function'|'method'|'variable'|'route' }} ScanMatch
 */

/**
 * Scan the workspace for symbols matching the search term.
 * @param {string} searchTerm
 * @param {string} workspaceRoot
 * @returns {ScanMatch[]}
 */
function scan(searchTerm, workspaceRoot) {
  const files = [];
  collectFiles(workspaceRoot, files);

  const results = [];
  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_err) {
      // Permission denied or other fs error — skip this file
      continue;
    }
    const matches = searchContent(content, searchTerm, filePath);
    results.push(...matches);
  }

  return results;
}

/**
 * Resolve tsconfig path using the candidate order.
 * @param {string} workspaceRoot
 * @param {string} filePath - path of the matched source file
 * @param {string|undefined} override - explicit --tsconfig value
 * @returns {string|undefined}
 */
function resolveTsconfig(workspaceRoot, filePath, override) {
  // If override is provided and exists, use it
  if (override !== undefined && override !== null) {
    if (fs.existsSync(override)) {
      return override;
    }
  }

  // Check candidates in order
  const candidates = [
    path.join(workspaceRoot, 'tsconfig.json'),
    path.join(workspaceRoot, 'tsconfig.base.json'),
    path.join(path.dirname(filePath), 'tsconfig.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

module.exports = { scan, resolveTsconfig };
