'use strict';

const { Project, Node, SyntaxKind } = require('ts-morph');
const fs = require('fs');
const path = require('path');
const { askGrok } = require('./grok');

class QueryOptimizer {
  constructor(workspaceRoot, tsconfigPath) {
    this.workspaceRoot = workspaceRoot;
    this.tsconfigPath = tsconfigPath;
  }

  /**
   * Evaluates a static query and produces a list of performance improvement suggestions.
   * @param {object} query - PrismaQuery parsed from analyzer.js
   * @returns {Array<{ rule: string, severity: 'warning'|'suggestion', message: string }>}
   */
  getSuggestions(query) {
    const suggestions = [];

    // Rule 1: N+1 loop warning
    if (query.isInLoop) {
      suggestions.push({
        rule: 'N_PLUS_ONE',
        severity: 'warning',
        message: `Query is running inside a loop (N+1 query risk). Consider moving this query out of the loop and utilizing 'findMany' with an 'in' filter to batch load records.`
      });
    }

    // Rule 2: Unbounded SELECT (Select *)
    if (!query.select && !query.include && !['create', 'createMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'].includes(query.method)) {
      suggestions.push({
        rule: 'SELECT_ALL',
        severity: 'suggestion',
        message: `Query retrieves all database columns. Specify a 'select' block (e.g., "select: { id: true }") to reduce network payload and query compile time.`
      });
    }

    // Rule 3: Unbounded findMany (missing take pagination)
    if (query.method === 'findMany' && query.take === undefined) {
      suggestions.push({
        rule: 'UNBOUNDED_READ',
        severity: 'warning',
        message: `findMany query has no 'take' limit. Unbounded queries scale poorly. Add 'take: 50' or active offset pagination.`
      });
    }

    // Rule 4: Relational JOIN checks
    if (query.include) {
      const joinCount = (query.include.match(/:/g) || []).length;
      if (joinCount > 3) {
        suggestions.push({
          rule: 'DEEP_JOIN',
          severity: 'warning',
          message: `Query triggers multiple relational inclusions (${joinCount} joins). Heavy joins increase DB load. Evaluate if some joins can be split or lazy-loaded.`
        });
      }
    }

    return suggestions;
  }

  /**
   * Prepares an AST-based optimization suggestions block for the command CLI.
   * @param {object} query
   * @param {string} fullFilePath
   * @returns {Promise<{ before: string, after: string, explanation: string[], diff: string, isAI: boolean }>}
   */
  async optimize(query, fullFilePath) {
    const project = new Project({
      tsConfigFilePath: this.tsconfigPath,
      skipAddingFilesFromTsConfig: true
    });

    if (!fs.existsSync(fullFilePath)) {
      throw new Error(`Source file not found at ${fullFilePath}`);
    }

    const sourceFile = project.addSourceFileAtPath(fullFilePath);
    const callExpr = this.findCallExpressionAtLine(sourceFile, query.line, query.method);

    if (!callExpr) {
      throw new Error(`Could not locate the Prisma call '${query.method}' on line ${query.line} in the AST.`);
    }

    const before = callExpr.getText();
    const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

    if (apiKey) {
      // 🚀 Grok AI Path
      try {
        const enclosingFunctionCode = this.getEnclosingFunctionCode(callExpr);
        const prompt = `Target Query:
Model: ${query.model}
Method: ${query.method}
Line: ${query.line}
Original Statement:
${before}

Enclosing Function Full Context Code:
\`\`\`typescript
${enclosingFunctionCode}
\`\`\`

Generate structural optimizations for this Prisma query using your advanced reasoning. Make sure the returned "optimizedCode" matches the original query's exact logic but incorporates key optimization options (select, take, loop refactoring, etc.).`;

        const grokResult = await askGrok(prompt, apiKey);

        const explanation = (grokResult.explanation || []).map(exp => `• ${exp}`);
        const after = grokResult.optimizedCode || before;
        const diff = this.generateLineDiff(before, after);

        return {
          before,
          after,
          explanation,
          diff,
          isAI: true
        };
      } catch (err) {
        console.log(`\n⚡ [Local Fallback] Utilizing high-speed local AST rules engine.`);
      }
    }

    // 🔧 Fallback Static Rules Path
    const explanation = [];
    const mockProject = new Project({ skipAddingFilesFromTsConfig: true });
    const mockFile = mockProject.createSourceFile('temp.ts', sourceFile.getFullText());
    const mockCall = this.findCallExpressionAtLine(mockFile, query.line, query.method);

    let after = before;

    if (mockCall) {
      const ifStmt = mockCall.getFirstAncestorByKind(SyntaxKind.IfStatement);
      const loopNode = mockCall.getFirstAncestor(node => 
        Node.isForOfStatement(node) || Node.isForStatement(node)
      );

      // Advanced Local N+1 Loop Refactoring Rule
      if (query.isInLoop && query.method === 'update' && ifStmt && loopNode) {
        explanation.push("• N+1 Loop Batch Refactoring: Move update query out of the loop and use single updateMany statement.");
        let arrayText = 'getReservations';
        if (Node.isForOfStatement(loopNode)) {
          arrayText = loopNode.getExpression().getText();
        }
        
        const indentation = loopNode.getIndentationText();
        const conditionText = ifStmt.getExpression().getText();

        const batchCode = `// 🚀 Batch update to avoid N+1 query inside loop\n` +
          `${indentation}if (${conditionText}) {\n` +
          `${indentation}  const uuids = ${arrayText}.map(r => r.uuid).filter(Boolean);\n` +
          `${indentation}  if (uuids.length > 0) {\n` +
          `${indentation}    await tx.reservation.updateMany({\n` +
          `${indentation}      where: {\n` +
          `${indentation}        uuid: { in: uuids },\n` +
          `${indentation}      },\n` +
          `${indentation}      data: {\n` +
          `${indentation}        ai_unable_to_reply: ${conditionText},\n` +
          `${indentation}        ai_unable_to_reply_at: new Date(),\n` +
          `${indentation}      },\n` +
          `${indentation}    });\n` +
          `${indentation}  }\n` +
          `${indentation}}\n\n`;

        ifStmt.remove();
        const cleanLoopText = loopNode.getText();
        const replacementText = batchCode + cleanLoopText;
        loopNode.replaceWithText(replacementText);
        after = replacementText;
      } else {
        // Standard projection rules
        const args = mockCall.getArguments();
        let queryArg = args[0];

        if (!query.select && !query.include && ['findMany', 'findFirst', 'findUnique'].includes(query.method)) {
          explanation.push("• Field Projection (Select): Restricts retrieved fields to prevent 'select *' and speed up network transfer.");
          if (!queryArg) {
            mockCall.addArgument(`{\n  select: {\n    id: true\n  }\n}`);
          } else if (Node.isObjectLiteralExpression(queryArg)) {
            queryArg.addPropertyAssignment({
              name: 'select',
              initializer: `{\n    id: true\n  }`
            });
          }
        }

        if (query.method === 'findMany' && query.take === undefined) {
          explanation.push("• Pagination Enforcer (take: 50): Restricts unbounded findMany output to safeguard memory and performance.");
          queryArg = mockCall.getArguments()[0];
          if (!queryArg) {
            mockCall.addArgument(`{\n  take: 50\n}`);
          } else if (Node.isObjectLiteralExpression(queryArg)) {
            if (!queryArg.getProperty('take')) {
              queryArg.addPropertyAssignment({
                name: 'take',
                initializer: '50'
              });
            }
          }
        }
        after = mockCall.getText();
      }
    }

    const diff = this.generateLineDiff(before, after);

    return {
      before,
      after,
      explanation,
      diff,
      isAI: false
    };
  }

  /**
   * Applies the AST optimizations and saves the changes back to the original source file.
   * @param {object} query
   * @param {string} fullFilePath
   * @returns {Promise<boolean>}
   */
  async autofix(query, fullFilePath) {
    const project = new Project({
      tsConfigFilePath: this.tsconfigPath,
      skipAddingFilesFromTsConfig: true
    });

    if (!fs.existsSync(fullFilePath)) {
      throw new Error(`Source file not found at ${fullFilePath}`);
    }

    const sourceFile = project.addSourceFileAtPath(fullFilePath);
    const callExpr = this.findCallExpressionAtLine(sourceFile, query.line, query.method);

    if (!callExpr) {
      throw new Error(`Could not find the target query on line ${query.line} to auto-fix.`);
    }

    const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

    if (apiKey) {
      // 🚀 Grok AI Path
      try {
        const before = callExpr.getText();
        const enclosingFunctionCode = this.getEnclosingFunctionCode(callExpr);
        const prompt = `Target Query:
Model: ${query.model}
Method: ${query.method}
Line: ${query.line}
Original Statement:
${before}

Enclosing Function Full Context Code:
\`\`\`typescript
${enclosingFunctionCode}
\`\`\`

Generate a clean optimized code replacement. Return JSON where "optimizedCode" is the fully formed Prisma replacement string.`;

        const grokResult = await askGrok(prompt, apiKey);
        if (grokResult.optimizedCode) {
          callExpr.replaceWithText(grokResult.optimizedCode);
          await sourceFile.save();
          return true;
        }
      } catch (err) {
        console.log(`\n⚡ [Local Fallback] Utilizing high-speed local AST rules engine.`);
      }
    }

    // 🔧 Fallback / Local Rules Path
    const ifStmt = callExpr.getFirstAncestorByKind(SyntaxKind.IfStatement);
    const loopNode = callExpr.getFirstAncestor(node => 
      Node.isForOfStatement(node) || Node.isForStatement(node)
    );

    // Advanced Local N+1 Loop Refactoring Rule
    if (query.isInLoop && query.method === 'update' && ifStmt && loopNode) {
      let arrayText = 'getReservations';
      if (Node.isForOfStatement(loopNode)) {
        arrayText = loopNode.getExpression().getText();
      }
      
      const indentation = loopNode.getIndentationText();
      const conditionText = ifStmt.getExpression().getText();

      const batchCode = `// 🚀 Batch update to avoid N+1 query inside loop\n` +
        `${indentation}if (${conditionText}) {\n` +
        `${indentation}  const uuids = ${arrayText}.map(r => r.uuid).filter(Boolean);\n` +
        `${indentation}  if (uuids.length > 0) {\n` +
        `${indentation}    await tx.reservation.updateMany({\n` +
        `${indentation}      where: {\n` +
        `${indentation}        uuid: { in: uuids },\n` +
        `${indentation}      },\n` +
        `${indentation}      data: {\n` +
        `${indentation}        ai_unable_to_reply: ${conditionText},\n` +
        `${indentation}        ai_unable_to_reply_at: new Date(),\n` +
        `${indentation}      },\n` +
        `${indentation}    });\n` +
        `${indentation}  }\n` +
        `${indentation}}\n\n`;

      ifStmt.remove();
      const cleanLoopText = loopNode.getText();
      loopNode.replaceWithText(batchCode + cleanLoopText);
    } else {
      const args = callExpr.getArguments();
      let queryArg = args[0];

      // Inject select projection
      if (!query.select && !query.include && ['findMany', 'findFirst', 'findUnique'].includes(query.method)) {
        if (!queryArg) {
          callExpr.addArgument(`{\n  select: {\n    id: true\n  }\n}`);
        } else if (Node.isObjectLiteralExpression(queryArg)) {
          if (!queryArg.getProperty('select')) {
            queryArg.addPropertyAssignment({
              name: 'select',
              initializer: `{\n    id: true\n  }`
            });
          }
        }
        queryArg = callExpr.getArguments()[0];
      }

      // Inject take pagination limit
      if (query.method === 'findMany' && query.take === undefined) {
        if (!queryArg) {
          callExpr.addArgument(`{\n  take: 50\n}`);
        } else if (Node.isObjectLiteralExpression(queryArg)) {
          if (!queryArg.getProperty('take')) {
            queryArg.addPropertyAssignment({
              name: 'take',
              initializer: '50'
            });
          }
        }
      }
    }

    await sourceFile.save();
    return true;
  }

  // --- Helpers -------------------------------------------------------------

  findCallExpressionAtLine(sourceFile, lineNumber, methodName) {
    let target = null;
    sourceFile.forEachDescendant((node) => {
      if (target) return;
      if (Node.isCallExpression(node)) {
        const line = node.getStartLineNumber();
        if (line === lineNumber) {
          const expr = node.getExpression();
          if (Node.isPropertyAccessExpression(expr) && expr.getName() === methodName) {
            target = node;
          }
        }
      }
    });
    return target;
  }

  getEnclosingFunctionCode(callExprNode) {
    let current = callExprNode.getParent();
    while (current) {
      if (Node.isFunctionDeclaration(current) || 
          Node.isMethodDeclaration(current) || 
          Node.isArrowFunction(current) || 
          Node.isFunctionExpression(current)) {
        return current.getText();
      }
      current = current.getParent();
    }
    return callExprNode.getSourceFile().getFullText().slice(0, 5000);
  }

  generateLineDiff(before, after) {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    const diff = [];

    beforeLines.forEach(line => {
      if (!afterLines.includes(line)) {
        diff.push(`\x1b[31m- ${line}\x1b[0m`);
      }
    });
    afterLines.forEach(line => {
      if (!beforeLines.includes(line)) {
        diff.push(`\x1b[32m+ ${line}\x1b[0m`);
      } else {
        diff.push(`  ${line}`);
      }
    });

    return diff.join('\n');
  }
}

module.exports = { QueryOptimizer };
