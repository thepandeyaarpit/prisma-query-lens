'use strict';

const { Project, Node, SyntaxKind } = require('ts-morph');
const fs = require('fs');
const path = require('path');

const BASE_PRISMA_ALIASES = new Set([
  'prisma', 'db', 'database', 'prismaClient', 'client',
  'tx', 'transaction', 'p', 'PrismaClient',
]);

const PRISMA_METHODS = new Set([
  'findFirst', 'findMany', 'findUnique', 'findUniqueOrThrow', 'findFirstOrThrow',
  'create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany',
  'upsert', 'aggregate', 'groupBy', 'count',
  '$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe',
]);

class QueryAnalyzer {
  constructor(workspaceRoot, tsconfigPath) {
    this.workspaceRoot = workspaceRoot;
    this.prismaAliases = new Set(BASE_PRISMA_ALIASES);
    this.visited = new Set();
    this.errors = [];
    this.callChain = [];

    if (tsconfigPath && fs.existsSync(tsconfigPath)) {
      this.project = new Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: false,
      });
    } else {
      this.project = new Project({
        compilerOptions: {
          target: 99, module: 1, strict: false,
          esModuleInterop: true, allowSyntheticDefaultImports: true,
          moduleResolution: 2, resolveJsonModule: true, allowJs: true,
        },
      });
      this.project.addSourceFilesAtPaths([
        `${workspaceRoot}/**/*.ts`,
        `${workspaceRoot}/**/*.tsx`,
        `!${workspaceRoot}/**/node_modules/**`,
        `!${workspaceRoot}/**/*.d.ts`,
        `!${workspaceRoot}/**/*.test.ts`,
        `!${workspaceRoot}/**/*.spec.ts`,
      ]);
    }
  }

  analyze(functionName, filePath) {
    this.visited = new Set();
    this.callChain = [];
    this.errors = [];
    this.prismaAliases = new Set(BASE_PRISMA_ALIASES);
    // Track the set of files reachable from the entry file via imports
    this.reachableFiles = new Set();
    this.reachableFiles.add(path.normalize(filePath));

    const queries = [];
    this.ensureFileLoaded(filePath);

    const found = this.findFunctionInFile(filePath, functionName);
    if (!found) {
      return {
        functionName, filePath,
        totalQueries: 0, queries: [],
        errors: [`Function '${functionName}' not found in ${path.basename(filePath)}`],
        callChain: [],
      };
    }

    // Pre-compute reachable files from the entry file (2 levels of imports)
    this.collectReachableFiles(found.sourceFile, 0);

    this.detectAliases(found.sourceFile);
    this.collectQueries(found.node, found.sourceFile, functionName, 0, queries);

    return {
      functionName, filePath,
      totalQueries: queries.length,
      queries,
      errors: this.errors,
      callChain: [...this.callChain],
    };
  }

  collectReachableFiles(sourceFile, depth) {
    if (depth > 3) return;
    try {
      for (const imp of sourceFile.getImportDeclarations()) {
        const resolved = imp.getModuleSpecifierSourceFile();
        if (!resolved) continue;
        const fp = path.normalize(resolved.getFilePath());
        if (fp.includes('node_modules')) continue;
        if (this.reachableFiles.has(fp)) continue;
        this.reachableFiles.add(fp);
        this.collectReachableFiles(resolved, depth + 1);
      }
    } catch { }
  }

  collectQueries(fnNode, sourceFile, fnName, depth, queries) {
    const MAX_DEPTH = 4;  // Reduced from 8 — prevents following deep utility chains
    const key = `${sourceFile.getFilePath()}::${fnName}`;
    if (this.visited.has(key) || depth > MAX_DEPTH) return;
    this.visited.add(key);
    if (!this.callChain.includes(fnName)) this.callChain.push(fnName);

    this.detectAliases(sourceFile);

    const callExpressions = [];
    fnNode.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) callExpressions.push(node);
    });

    for (const callExpr of callExpressions) {
      const query = this.tryExtractPrismaQuery(callExpr, fnName, depth, sourceFile.getFilePath());
      if (query) { queries.push(query); continue; }
      this.tryFollowCall(callExpr, sourceFile, depth, queries);
    }
  }

  tryFollowCall(callExpr, currentFile, depth, queries) {
    try {
      const expr = callExpr.getExpression();
      let identifier;

      if (Node.isIdentifier(expr)) {
        identifier = expr;
      } else if (Node.isPropertyAccessExpression(expr)) {
        const objText = expr.getExpression().getText();
        if (
          this.isPrismaAlias(objText) ||
          ['console', 'process', 'Math', 'JSON', 'Object', 'Array', 'Promise'].includes(objText)
        ) return;
        identifier = expr.getNameNode();
      }

      if (!identifier) return;

      const allDefs = [];
      try {
        const sym = identifier.getSymbol();
        if (sym) allDefs.push(...sym.getDeclarations());
      } catch { return; }

      // Only follow the FIRST valid definition to avoid following all overloads
      for (const def of allDefs.slice(0, 1)) {
        const defFilePath = def.getSourceFile().getFilePath();
        const normalizedDefPath = path.normalize(defFilePath);

        // Skip node_modules entirely
        if (defFilePath.includes('node_modules')) continue;

        // Skip .d.ts declaration files
        if (defFilePath.endsWith('.d.ts')) continue;

        // Only follow calls into files that are reachable via imports from the entry file
        // This prevents following unrelated services that happen to have the same function name
        if (this.reachableFiles && this.reachableFiles.size > 0 && !this.reachableFiles.has(normalizedDefPath)) continue;

        let targetFn = null;
        let targetName = '';

        if (Node.isFunctionDeclaration(def) || Node.isMethodDeclaration(def) ||
            Node.isArrowFunction(def) || Node.isFunctionExpression(def)) {
          targetFn = def;
          targetName = def.getName?.() ?? 'anonymous';
        } else if (Node.isVariableDeclaration(def)) {
          const init = def.getInitializer();
          if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
            targetFn = init;
            targetName = def.getName();
          }
        }

        if (targetFn && targetName) {
          this.ensureFileLoaded(defFilePath);
          this.detectAliases(def.getSourceFile());
          this.collectQueries(targetFn, def.getSourceFile(), targetName, depth + 1, queries);
        }
      }
    } catch { /* skip */ }
  }

  tryExtractPrismaQuery(callExpr, calledFrom, depth, filePath) {
    const expr = callExpr.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) return null;

    const method = expr.getName();
    if (!PRISMA_METHODS.has(method)) return null;

    const objectExpr = expr.getExpression();
    const objectText = objectExpr.getText();

    if (method.startsWith('$')) {
      if (!this.isPrismaAlias(objectText)) return null;
      const rawArgs = callExpr.getArguments().map(a => a.getText()).join(', ');
      return {
        model: '$raw', method, line: callExpr.getStartLineNumber(),
        filePath: path.basename(filePath), fullFilePath: filePath,
        calledFrom, callDepth: depth,
        isInLoop: this.isInsideLoop(callExpr),
        clientAlias: objectText,
        rawQuery: rawArgs,
        sql: `-- RAW: ${rawArgs.slice(0, 100)}`,
      };
    }

    if (!Node.isPropertyAccessExpression(objectExpr)) return null;

    const model = objectExpr.getName();
    const clientAlias = objectExpr.getExpression().getText();
    if (!this.isPrismaAlias(clientAlias)) return null;

    const args = callExpr.getArguments();
    const queryArg = args[0];
    let where, select, include, orderBy, take, skip;

    if (queryArg && Node.isObjectLiteralExpression(queryArg)) {
      const getText = (key) => {
        const prop = queryArg.getProperty(key);
        if (!prop) return undefined;
        const text = prop.getText();
        const idx = text.indexOf(':');
        return idx !== -1 ? text.slice(idx + 1).trim() : undefined;
      };
      where = getText('where');
      select = getText('select');
      include = getText('include');
      orderBy = getText('orderBy');
      const t = getText('take'), s = getText('skip');
      if (t && /^\d+$/.test(t)) take = parseInt(t);
      if (s && /^\d+$/.test(s)) skip = parseInt(s);
    }

    return {
      model, method,
      line: callExpr.getStartLineNumber(),
      filePath: path.basename(filePath),
      fullFilePath: filePath,
      calledFrom, callDepth: depth,
      isInLoop: this.isInsideLoop(callExpr),
      clientAlias, where, select, include, orderBy, take, skip,
      sql: this.generateSQL(model, method, where, select, include, orderBy, take, skip),
    };
  }

  generateSQL(model, method, where, select, include, orderBy, take, skip) {
    const table = model.toLowerCase();
    let cols = '*';
    if (select) {
      const fields = [...select.matchAll(/(\w+)\s*:\s*true/g)].map(m => m[1]);
      if (fields.length > 0) cols = fields.join(', ');
    }
    let joinHint = '';
    if (include) {
      const rels = [...include.matchAll(/(\w+)\s*:/g)].map(m => m[1]);
      if (rels.length > 0) joinHint = `\n-- JOINs: ${rels.join(', ')}`;
    }
    let whereClause = '';
    if (where) {
      const conditions = [];
      for (const [, key, val] of [...where.matchAll(/(\w+)\s*:\s*([^,}]+)/g)]) {
        const v = val.trim();
        if (v.startsWith('{')) {
          const inM = v.match(/in\s*:\s*\[/);
          const notM = v.match(/not\s*:\s*([^,}]+)/);
          const gteM = v.match(/gte\s*:\s*([^,}]+)/);
          const lteM = v.match(/lte\s*:\s*([^,}]+)/);
          if (inM) conditions.push(`${key} IN (...)`);
          else if (notM) conditions.push(`${key} != ${notM[1].trim()}`);
          else if (gteM && lteM) conditions.push(`${key} BETWEEN ... AND ...`);
          else if (gteM) conditions.push(`${key} >= ${gteM[1].trim()}`);
          else if (lteM) conditions.push(`${key} <= ${lteM[1].trim()}`);
          else conditions.push(`${key} = ?`);
        } else {
          conditions.push(`${key} = ${v}`);
        }
      }
      if (conditions.length) whereClause = `\nWHERE ${conditions.join(' AND ')}`;
    }
    let orderClause = '';
    if (orderBy) {
      const orders = [...orderBy.matchAll(/(\w+)\s*:\s*['"]?(asc|desc)['"]?/gi)];
      if (orders.length) orderClause = `\nORDER BY ${orders.map(([,f,d]) => `${f} ${d.toUpperCase()}`).join(', ')}`;
    }
    const limitClause = take !== undefined ? `\nLIMIT ${take}` : '';
    const offsetClause = skip !== undefined ? `\nOFFSET ${skip}` : '';

    switch (method) {
      case 'findMany': return `SELECT ${cols}\nFROM ${table}${joinHint}${whereClause}${orderClause}${limitClause}${offsetClause};`;
      case 'findFirst': case 'findFirstOrThrow': return `SELECT ${cols}\nFROM ${table}${joinHint}${whereClause}${orderClause}\nLIMIT 1;`;
      case 'findUnique': case 'findUniqueOrThrow': return `SELECT ${cols}\nFROM ${table}${joinHint}${whereClause}\nLIMIT 1;`;
      case 'create': return `INSERT INTO ${table} (...)\nVALUES (...);`;
      case 'createMany': return `INSERT INTO ${table} (...)\nVALUES (...), (...);`;
      case 'update': return `UPDATE ${table}\nSET ...${whereClause};`;
      case 'updateMany': return `UPDATE ${table}\nSET ...${whereClause};`;
      case 'delete': return `DELETE FROM ${table}${whereClause}\nLIMIT 1;`;
      case 'deleteMany': return `DELETE FROM ${table}${whereClause};`;
      case 'upsert': return `INSERT INTO ${table} (...)\nVALUES (...)\nON CONFLICT (...) DO UPDATE SET ...;`;
      case 'count': return `SELECT COUNT(*)\nFROM ${table}${whereClause};`;
      case 'aggregate': return `SELECT COUNT(*), MIN(...), MAX(...), AVG(...)\nFROM ${table}${whereClause};`;
      case 'groupBy': return `SELECT ..., COUNT(*)\nFROM ${table}${whereClause}\nGROUP BY ...;`;
      default: return `-- ${method} on ${table}`;
    }
  }

  detectAliases(sourceFile) {
    try {
      for (const imp of sourceFile.getImportDeclarations()) {
        const from = imp.getModuleSpecifierValue();
        if (from.includes('prisma') || from.includes('/db') || from.includes('/database') || from === '@prisma/client') {
          const def = imp.getDefaultImport();
          if (def) this.prismaAliases.add(def.getText());
          for (const named of imp.getNamedImports()) {
            this.prismaAliases.add(named.getAliasNode()?.getText() ?? named.getName());
          }
        }
      }
      for (const v of sourceFile.getVariableDeclarations()) {
        const init = v.getInitializer();
        if (!init) continue;
        const text = init.getText();
        if (this.prismaAliases.has(text) || text.includes('PrismaClient') || text.includes('prisma')) {
          this.prismaAliases.add(v.getName());
        }
      }
    } catch { }
  }

  isPrismaAlias(text) {
    if (this.prismaAliases.has(text)) return true;
    const parts = text.split('.');
    const last = parts[parts.length - 1];
    return this.prismaAliases.has(last) || last.toLowerCase().includes('prisma');
  }

  isInsideLoop(node) {
    let current = node.getParent();
    while (current) {
      const kind = current.getKind();
      if ([SyntaxKind.ForStatement, SyntaxKind.ForOfStatement, SyntaxKind.ForInStatement,
           SyntaxKind.WhileStatement, SyntaxKind.DoStatement].includes(kind)) return true;
      if (Node.isCallExpression(current)) {
        const expr = current.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
          if (['forEach','map','filter','reduce','flatMap'].includes(expr.getName())) return true;
        }
      }
      current = current.getParent();
    }
    return false;
  }

  findFunctionInFile(filePath, name) {
    const sourceFile = this.project.getSourceFile(filePath);
    if (!sourceFile) return null;

    for (const fn of sourceFile.getFunctions()) {
      if (fn.getName() === name) return { node: fn, sourceFile };
    }
    for (const cls of sourceFile.getClasses()) {
      for (const method of cls.getMethods()) {
        if (method.getName() === name) return { node: method, sourceFile };
      }
    }
    for (const v of sourceFile.getVariableDeclarations()) {
      if (v.getName() === name) {
        const init = v.getInitializer();
        if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
          return { node: init, sourceFile };
        }
      }
    }
    let found = null;
    sourceFile.forEachDescendant((node) => {
      if (found) return;
      if ((Node.isMethodDeclaration(node) || Node.isFunctionDeclaration(node)) && node.getName?.() === name) {
        found = { node, sourceFile };
      }
    });
    return found;
  }

  ensureFileLoaded(filePath) {
    try {
      if (!this.project.getSourceFile(filePath) && fs.existsSync(filePath)) {
        this.project.addSourceFileAtPath(filePath);
      }
    } catch { }
  }
}

module.exports = { QueryAnalyzer };
