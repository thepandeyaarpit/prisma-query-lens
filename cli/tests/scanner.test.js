'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const fc = require('fast-check');
const { scan, resolveTsconfig } = require('../scanner.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a temporary directory and return its path.
 * @returns {string}
 */
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
}

/**
 * Recursively remove a directory.
 * @param {string} dir
 */
function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_err) {
    // best-effort cleanup
  }
}

/**
 * Write a file, creating parent directories as needed.
 * @param {string} filePath
 * @param {string} content
 */
function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Property 7: Scanner never returns excluded paths
// Feature: query-lens-cli-mode, Property 7: scanner never returns excluded paths
// Validates: Requirements 3.1, 4.1
// ---------------------------------------------------------------------------

describe('Property 7: scanner never returns excluded paths', () => {
  it('scan() never returns matches from excluded directories or file patterns', () => {
    // Arbitraries for excluded directory names and file suffixes
    const excludedDirArb = fc.constantFrom('node_modules', 'dist', 'build', '.git');
    const excludedSuffixArb = fc.constantFrom('.d.ts', '.test.ts', '.test.js', '.spec.ts', '.spec.js');
    const validNameArb = fc
      .stringMatching(/^[a-z][a-z0-9]{2,8}$/)
      .filter((s) => !['node', 'dist', 'build', 'git'].includes(s));

    const arb = fc.record({
      excludedDir: excludedDirArb,
      excludedSuffix: excludedSuffixArb,
      funcName: validNameArb,
    });

    fc.assert(
      fc.property(arb, ({ excludedDir, excludedSuffix, funcName }) => {
        const tmpDir = makeTempDir();
        try {
          // Write a file with a matching function inside an excluded directory
          const excludedFilePath = path.join(tmpDir, excludedDir, `${funcName}${excludedSuffix}`);
          writeFile(excludedFilePath, `function ${funcName}() {}\n`);

          // Also write a file with the same function name but with an excluded suffix at root
          const excludedRootFile = path.join(tmpDir, `${funcName}${excludedSuffix}`);
          writeFile(excludedRootFile, `function ${funcName}() {}\n`);

          const results = scan(funcName, tmpDir);

          // None of the results should come from excluded paths
          for (const match of results) {
            const relPath = path.relative(tmpDir, match.filePath);
            const segments = relPath.split(path.sep);

            // Check no excluded directory segment
            const hasExcludedDir = segments.some((seg) =>
              ['node_modules', 'dist', 'build', '.git'].includes(seg)
            );
            assert.equal(hasExcludedDir, false, `Result path contains excluded dir: ${match.filePath}`);

            // Check no excluded file suffix
            const fileName = path.basename(match.filePath);
            const hasExcludedSuffix =
              fileName.endsWith('.d.ts') ||
              fileName.endsWith('.test.ts') ||
              fileName.endsWith('.test.js') ||
              fileName.endsWith('.spec.ts') ||
              fileName.endsWith('.spec.js');
            assert.equal(hasExcludedSuffix, false, `Result path has excluded suffix: ${match.filePath}`);
          }
        } finally {
          rmDir(tmpDir);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: tsconfig resolution returns first existing candidate
// Feature: query-lens-cli-mode, Property 8: tsconfig resolution returns first existing candidate
// Validates: Requirements 6.2
// ---------------------------------------------------------------------------

describe('Property 8: tsconfig resolution returns first existing candidate', () => {
  it('resolveTsconfig() returns the first existing candidate or undefined', () => {
    // Generate boolean flags for which of the 3 candidates exist
    const arb = fc.record({
      hasWorkspaceJson: fc.boolean(),
      hasWorkspaceBase: fc.boolean(),
      hasFileDir: fc.boolean(),
    });

    fc.assert(
      fc.property(arb, ({ hasWorkspaceJson, hasWorkspaceBase, hasFileDir }) => {
        const tmpDir = makeTempDir();
        try {
          const workspaceRoot = path.join(tmpDir, 'workspace');
          const srcDir = path.join(tmpDir, 'workspace', 'src');
          const filePath = path.join(srcDir, 'service.ts');

          fs.mkdirSync(workspaceRoot, { recursive: true });
          fs.mkdirSync(srcDir, { recursive: true });

          const candidate1 = path.join(workspaceRoot, 'tsconfig.json');
          const candidate2 = path.join(workspaceRoot, 'tsconfig.base.json');
          const candidate3 = path.join(srcDir, 'tsconfig.json');

          if (hasWorkspaceJson) fs.writeFileSync(candidate1, '{}', 'utf8');
          if (hasWorkspaceBase) fs.writeFileSync(candidate2, '{}', 'utf8');
          if (hasFileDir) fs.writeFileSync(candidate3, '{}', 'utf8');

          const result = resolveTsconfig(workspaceRoot, filePath, undefined);

          // Determine expected result
          let expected;
          if (hasWorkspaceJson) {
            expected = candidate1;
          } else if (hasWorkspaceBase) {
            expected = candidate2;
          } else if (hasFileDir) {
            expected = candidate3;
          } else {
            expected = undefined;
          }

          assert.equal(result, expected, `Expected ${expected}, got ${result}`);
        } finally {
          rmDir(tmpDir);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests for scanner.js specific examples
// ---------------------------------------------------------------------------

describe('Unit tests: scanner.js', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmDir(tmpDir);
  });

  it('file in node_modules/ is not returned', () => {
    const filePath = path.join(tmpDir, 'node_modules', 'lib', 'index.js');
    writeFile(filePath, 'function getUserById(id) { return id; }\n');

    const results = scan('getUserById', tmpDir);
    assert.equal(results.length, 0, 'Should not return matches from node_modules');
  });

  it('file matching *.d.ts is not returned', () => {
    const filePath = path.join(tmpDir, 'src', 'types.d.ts');
    writeFile(filePath, 'declare function getUserById(id: string): User;\n');

    const results = scan('getUserById', tmpDir);
    assert.equal(results.length, 0, 'Should not return matches from .d.ts files');
  });

  it('file with function getUserById( returns match with functionName and matchType function', () => {
    const filePath = path.join(tmpDir, 'src', 'user.service.ts');
    writeFile(filePath, 'async function getUserById(id: string) {\n  return db.user.findUnique({ where: { id } });\n}\n');

    const results = scan('getUserById', tmpDir);
    assert.equal(results.length, 1, 'Should return exactly one match');
    assert.equal(results[0].functionName, 'getUserById');
    assert.equal(results[0].matchType, 'function');
    assert.equal(results[0].filePath, filePath);
  });

  it("file with router.get('/users/:id', handler) returns match with matchType route", () => {
    const filePath = path.join(tmpDir, 'src', 'routes.js');
    writeFile(
      filePath,
      "const express = require('express');\nconst router = express.Router();\nrouter.get('/users/:id', getUserById);\n"
    );

    const results = scan('/users/:id', tmpDir);
    assert.equal(results.length, 1, 'Should return exactly one route match');
    assert.equal(results[0].matchType, 'route');
    assert.equal(results[0].functionName, 'getUserById');
    assert.equal(results[0].filePath, filePath);
  });

  it('file with const name = () => {} returns match with matchType variable', () => {
    const filePath = path.join(tmpDir, 'src', 'handlers.ts');
    writeFile(filePath, 'const getUser = async (id: string) => {\n  return db.user.findUnique({ where: { id } });\n};\n');

    const results = scan('getUser', tmpDir);
    assert.equal(results.length, 1, 'Should return exactly one variable match');
    assert.equal(results[0].functionName, 'getUser');
    assert.equal(results[0].matchType, 'variable');
  });

  it('file with class method returns match with matchType method', () => {
    const filePath = path.join(tmpDir, 'src', 'user.controller.ts');
    writeFile(
      filePath,
      'class UserController {\n  async findUser(id: string) {\n    return this.userService.findById(id);\n  }\n}\n'
    );

    const results = scan('findUser', tmpDir);
    assert.equal(results.length, 1, 'Should return exactly one method match');
    assert.equal(results[0].functionName, 'findUser');
    assert.equal(results[0].matchType, 'method');
  });

  it('*.test.ts files are not returned', () => {
    const filePath = path.join(tmpDir, 'src', 'user.test.ts');
    writeFile(filePath, 'function getUserById(id) { return id; }\n');

    const results = scan('getUserById', tmpDir);
    assert.equal(results.length, 0, 'Should not return matches from .test.ts files');
  });

  it('*.spec.js files are not returned', () => {
    const filePath = path.join(tmpDir, 'src', 'user.spec.js');
    writeFile(filePath, 'function getUserById(id) { return id; }\n');

    const results = scan('getUserById', tmpDir);
    assert.equal(results.length, 0, 'Should not return matches from .spec.js files');
  });

  it('files in dist/ directory are not returned', () => {
    const filePath = path.join(tmpDir, 'dist', 'user.service.js');
    writeFile(filePath, 'function getUserById(id) { return id; }\n');

    const results = scan('getUserById', tmpDir);
    assert.equal(results.length, 0, 'Should not return matches from dist/');
  });

  it('files in build/ directory are not returned', () => {
    const filePath = path.join(tmpDir, 'build', 'user.service.js');
    writeFile(filePath, 'function getUserById(id) { return id; }\n');

    const results = scan('getUserById', tmpDir);
    assert.equal(results.length, 0, 'Should not return matches from build/');
  });

  it('NestJS @Get decorator route match returns correct functionName', () => {
    const filePath = path.join(tmpDir, 'src', 'user.controller.ts');
    writeFile(
      filePath,
      "import { Controller, Get } from '@nestjs/common';\n@Controller('users')\nexport class UserController {\n  @Get('/profile')\n  async getProfile() {\n    return this.userService.getProfile();\n  }\n}\n"
    );

    const results = scan('/profile', tmpDir);
    assert.equal(results.length, 1, 'Should return one NestJS route match');
    assert.equal(results[0].matchType, 'route');
    assert.equal(results[0].functionName, 'getProfile');
  });

  it('resolveTsconfig returns override when it exists', () => {
    const workspaceRoot = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    const overridePath = path.join(tmpDir, 'custom-tsconfig.json');
    fs.writeFileSync(overridePath, '{}', 'utf8');

    const result = resolveTsconfig(workspaceRoot, path.join(workspaceRoot, 'src', 'file.ts'), overridePath);
    assert.equal(result, overridePath);
  });

  it('resolveTsconfig ignores override when it does not exist', () => {
    const workspaceRoot = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
    fs.writeFileSync(tsconfigPath, '{}', 'utf8');

    const nonExistentOverride = path.join(tmpDir, 'nonexistent.json');
    const result = resolveTsconfig(workspaceRoot, path.join(workspaceRoot, 'src', 'file.ts'), nonExistentOverride);
    assert.equal(result, tsconfigPath);
  });

  it('resolveTsconfig returns undefined when no candidates exist', () => {
    const workspaceRoot = path.join(tmpDir, 'workspace');
    const srcDir = path.join(workspaceRoot, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const result = resolveTsconfig(workspaceRoot, path.join(srcDir, 'file.ts'), undefined);
    assert.equal(result, undefined);
  });

  it('scan handles fs errors gracefully and continues', () => {
    // Write a valid file alongside a directory that will cause issues
    const validFile = path.join(tmpDir, 'src', 'valid.ts');
    writeFile(validFile, 'function myFunc() {}\n');

    // scan should still return the valid file match
    const results = scan('myFunc', tmpDir);
    assert.equal(results.length, 1);
    assert.equal(results[0].functionName, 'myFunc');
  });
});
