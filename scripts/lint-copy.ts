/**
 * Copy lint (spec §15, CLAUDE.md). Scans src/screens and src/ui for banned terms.
 * The results screen (src/screens/Results) may use the non-telegraphing vocabulary;
 * the §15.2 list still applies there.
 */
import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { findViolations } from './lib/copy-rules';
import { walk } from './lib/walk';

const RESULTS_DIR = `src${sep}screens${sep}Results${sep}`;
const files = [...walk('src/screens', ['.ts', '.tsx']), ...walk('src/ui', ['.ts', '.tsx']), ...walk('src/mock', ['.ts'])];

let failures = 0;
for (const file of files) {
  const allow = file.startsWith(RESULTS_DIR);
  for (const v of findViolations(readFileSync(file, 'utf8'), { allowNonTelegraphing: allow })) {
    failures++;
    console.error(`${file}:${v.line}: "${v.term}" (${v.rule})`);
  }
}
if (failures > 0) {
  console.error(`lint:copy failed with ${failures} violation(s).`);
  process.exit(1);
}
console.log(`lint:copy passed (${files.length} files).`);
