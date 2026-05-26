'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { QueryAnalyzer } = require('./analyzer');

const PORT = process.env.PORT || 4242;
const HOST = 'localhost';

// Resolve index.html relative to this file
const HTML_PATH = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {

  // ── Serve UI ──────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/') {
    try {
      const html = fs.readFileSync(HTML_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      res.writeHead(500);
      res.end(`Error reading index.html: ${err.message}`);
    }
    return;
  }

  // ── Health check ──────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
    return;
  }

  // ── Analyze API ───────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/analyze') {
    // Allow CORS for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { functionName, filePath, workspaceRoot } = JSON.parse(body);

        if (!functionName || !filePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'functionName and filePath are required' }));
          return;
        }

        const normalizedFilePath = filePath.replace(/\//g, path.sep);
        const normalizedRoot = workspaceRoot
          ? workspaceRoot.replace(/\//g, path.sep)
          : path.dirname(normalizedFilePath);

        if (!fs.existsSync(normalizedFilePath)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `File not found: ${normalizedFilePath}` }));
          return;
        }

        let tsconfigPath;
        const tsCandidates = [
          path.join(normalizedRoot, 'tsconfig.json'),
          path.join(normalizedRoot, 'tsconfig.base.json'),
          path.join(path.dirname(normalizedFilePath), 'tsconfig.json'),
        ];
        for (const c of tsCandidates) {
          if (fs.existsSync(c)) { tsconfigPath = c; break; }
        }

        console.log(`\n→ Analyzing: ${functionName}`);
        const analyzer = new QueryAnalyzer(normalizedRoot, tsconfigPath);
        const result = analyzer.analyze(functionName, normalizedFilePath);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── CORS preflight ────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║         🔍  Query Lens  v1.0.6         ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║  Running at: ${url}          ║`);
  console.log('║  Press Ctrl+C to stop                  ║');
  console.log('╚════════════════════════════════════════╝\n');
  openBrowser(url);
});

function openBrowser(url) {
  try {
    const platform = process.platform;
    if (platform === 'win32') execSync(`start "" "${url}"`, { stdio: 'ignore' });
    else if (platform === 'darwin') execSync(`open "${url}"`, { stdio: 'ignore' });
    else execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
  } catch {}
}
