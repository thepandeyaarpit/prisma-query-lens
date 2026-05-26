'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-beta'; // Default widely accessible xAI Grok model ID

/**
 * Searches for and parses a .env file from the given root folder.
 * Populates process.env with any keys found.
 * @param {string} root
 */
function loadEnv(root) {
  try {
    const envPath = path.join(root, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            let val = trimmed.slice(idx + 1).trim();
            // strip optional quotes
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            process.env[key] = val;
          }
        }
      });
    }
  } catch (_err) {
    // Ignore issues loading environment
  }
}

/**
 * Direct HTTPS request client to bypass Node.js fetch version discrepancies.
 */
function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data)
        });
      });
    });

    req.on('error', (err) => { reject(err); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Sends a query and code block to the xAI Grok model, returning a structured JSON recommendation.
 * @param {string} prompt
 * @param {string} apiKey
 * @returns {Promise<{ suggestions: string[], optimizedCode: string, explanation: string[], riskRating: string }>}
 */
async function askGrok(prompt, apiKey) {
  const systemPrompt = `You are an expert Prisma ORM and database performance query optimizer.
Your objective is to analyze a given TypeScript/JavaScript function and a specific target Prisma query call inside it, and return optimized recommendations.

You must respond with a strict, valid JSON object matching this schema:
{
  "suggestions": [
    "Suggestion 1",
    "Suggestion 2"
  ],
  "optimizedCode": "await prisma.user.findFirst({ where: { ... } })",
  "explanation": [
    "Explanation item 1",
    "Explanation item 2"
  ],
  "riskRating": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}

Do not include any markdown fences or formatting other than a single, perfectly structured raw JSON block.`;

  try {
    const response = await httpsPost(
      XAI_API_URL,
      { 'Authorization': `Bearer ${apiKey}` },
      {
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`xAI API responded with ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const contentText = data.choices?.[0]?.message?.content;
    if (!contentText) {
      throw new Error("Empty response returned from Grok AI API.");
    }

    const result = JSON.parse(contentText);
    return result;
  } catch (err) {
    throw new Error(`Grok API Error: ${err.message}`);
  }
}

module.exports = { loadEnv, askGrok };
