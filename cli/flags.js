'use strict';

/**
 * Parse a raw argv slice into a ParsedFlags object.
 *
 * Supported flags:
 *   --cli          boolean, default false
 *   --help         boolean, default false
 *   --json         boolean, default false
 *   --no-color     boolean (sets noColor), default false
 *   --root <path>  string,  default process.cwd()
 *   --tsconfig <path> string, default undefined
 *
 * Unknown flags are silently ignored.
 * If --root or --tsconfig appears at end of argv with no following value,
 * the flag is treated as absent and the default is applied.
 *
 * @param {string[]} argv - raw argv slice (e.g. process.argv.slice(2))
 * @returns {{ cli: boolean, help: boolean, json: boolean, noColor: boolean, root: string, tsconfig: string|undefined }}
 */
function parse(argv) {
  const result = {
    cli: false,
    help: false,
    json: false,
    noColor: false,
    root: process.cwd(),
    tsconfig: undefined,
  };

  const VALUE_FLAGS = new Set(['--root', '--tsconfig']);
  const BOOLEAN_FLAGS = new Set(['--cli', '--help', '--json', '--no-color']);

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];

    if (token === '--cli') {
      result.cli = true;
    } else if (token === '--help') {
      result.help = true;
    } else if (token === '--json') {
      result.json = true;
    } else if (token === '--no-color') {
      result.noColor = true;
    } else if (token === '--root') {
      // Consume next token as value, only if it exists and is not itself a flag
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result.root = next;
        i++; // skip the value token
      }
      // else: treat as absent, keep default
    } else if (token === '--tsconfig') {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result.tsconfig = next;
        i++; // skip the value token
      }
      // else: treat as absent, keep default (undefined)
    }
    // Unknown flags (any --foo not in the supported set) are silently ignored

    i++;
  }

  return result;
}

module.exports = { parse };
