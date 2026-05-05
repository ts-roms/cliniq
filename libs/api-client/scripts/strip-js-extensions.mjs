// Walks src/generated and rewrites `.js` import suffixes inside .ts files.
// Run after `openapi-ts` so the generated SDK matches Next/Turbopack's
// extension-less resolver. Idempotent.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/generated';

const PATTERNS = [
  /(['"])(\.\.?\/[^'"]+?)\.js\1/g, // './foo.js' or '../foo.js'
];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!full.endsWith('.ts')) continue;
    const before = readFileSync(full, 'utf8');
    let after = before;
    for (const re of PATTERNS) after = after.replace(re, '$1$2$1');
    if (after !== before) writeFileSync(full, after);
  }
}

walk(ROOT);
console.log(`[strip-js-extensions] cleaned ${ROOT}`);
