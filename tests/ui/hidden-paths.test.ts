/**
 * Hidden values (τ, the end round, private pact records, other firms' private data) must
 * never reach participant or projector code paths (CLAUDE.md; spec §3). Session 9 audit.
 *
 * - Participant pages (#/, #/j, #/play and the participant results card): their whole
 *   import graph must exclude the facilitator hooks and the orchestrator, which read `engine`.
 * - Projector (#/screen): it runs the orchestrator (F9 resolves), but its own source must not
 *   subscribe to or render a hidden node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

const HIDDEN_READERS = /\b(readEngine|subscribeEngine|useEngine|readPactsPrivate|subscribePactsPrivate|usePactsPrivate|readFirmsPrivate|subscribeDecisions|useDecisions)\b/;
const HIDDEN_FIELDS = /\.(tau|endRound)\b|\bpactsPrivate\b/;

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = normalize(join(dirname(from), spec));
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(cand) && !cand.endsWith('/') && /\.(ts|tsx)$/.test(cand)) return cand;
  }
  return null;
}

/** Every local module reachable from `entry` through value imports (type-only imports carry no code). */
function graph(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gms)) {
      if (m[1]) continue;
      const next = resolveImport(file, m[2] ?? '');
      if (next) stack.push(next);
    }
    for (const m of src.matchAll(/^export\s+[^;]*?from\s+'([^']+)'/gms)) {
      const next = resolveImport(file, m[1] ?? '');
      if (next) stack.push(next);
    }
  }
  return seen;
}

const PARTICIPANT_ENTRIES = ['src/screens/Index.tsx', 'src/screens/Join/Join.tsx', 'src/screens/Play/Play.tsx', 'src/screens/Results/OwnResultsCard.tsx'];

describe('participant pages never load a hidden-value reader', () => {
  for (const entry of PARTICIPANT_ENTRIES) {
    it(entry, () => {
      const files = [...graph(entry)];
      expect(files.length).toBeGreaterThan(1);
      expect(files).not.toContain('src/state/facilitator.ts');
      expect(files).not.toContain('src/firebase/orchestrator.ts');
      for (const f of files.filter((x) => x.startsWith('src/screens') || x.startsWith('src/state'))) {
        const src = readFileSync(f, 'utf8');
        expect(HIDDEN_READERS.test(src), `${f} references a hidden-value reader`).toBe(false);
        expect(HIDDEN_FIELDS.test(src), `${f} references tau, endRound or pactsPrivate`).toBe(false);
      }
    });
  }
});

describe('projector source never subscribes to or renders a hidden node', () => {
  it('src/screens/Screen/*', () => {
    for (const f of ['Screen.tsx', 'BoardView.tsx', 'Views.tsx', 'model.ts', 'briefing.ts']) {
      const src = readFileSync(`src/screens/Screen/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(/\b(useEngine|usePactsPrivate|readEngine|subscribeEngine|readPactsPrivate)\b/.test(src), f).toBe(false);
      expect(HIDDEN_FIELDS.test(src), f).toBe(false);
    }
  });

  it('orchestrator messages shown on the projector carry no hidden value', () => {
    const src = readFileSync('src/firebase/orchestrator.ts', 'utf8');
    // Every ok(...) and fail(...) template must not interpolate tau or the end round.
    for (const m of src.matchAll(/\b(ok|fail)\(([^;]*?)\)/gs)) {
      expect(/tau|endRound/.test(m[2] ?? ''), m[0]).toBe(false);
    }
  });
});
