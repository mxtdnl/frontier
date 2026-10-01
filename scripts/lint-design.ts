import { readFileSync } from 'node:fs';
import { findForbiddenCss, findHex } from './lib/design-rules';
import { walk } from './lib/walk';

const files = walk('src', ['.ts', '.tsx', '.css']);
let failures = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const isTokens = file.endsWith('tokens.css');
  const found = [...(isTokens ? [] : findHex(text)), ...(file.endsWith('.css') ? findForbiddenCss(text) : [])];
  for (const v of found) {
    failures++;
    console.error(`${file}:${v.line}: ${v.detail}`);
  }
}
if (failures > 0) {
  console.error(`lint:design failed with ${failures} violation(s).`);
  process.exit(1);
}
console.log(`lint:design passed (${files.length} files).`);
