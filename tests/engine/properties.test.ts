/** Property tests (CLAUDE.md "Testing expectations"). Random inputs come from a seeded generator. */
import { describe, expect, it } from 'vitest';
import {
  CARDS,
  mulberry32,
  nextPactName,
  resolveRound,
  runCounterfactual,
  type Decision,
  type EngineState,
  type Pace,
  type Rng,
} from '../../src/engine';
import { game } from './helpers';

function randomDecisions(s: EngineState, r: Rng): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  for (const f of s.firms) {
    if (r() < 0.15) continue; // missing → defaults
    const others = s.firms.filter((g) => g.id !== f.id);
    out[f.id] = {
      pace: (1 + Math.floor(r() * 4)) as Pace,
      safety: Math.floor(r() * 31),
      card: CARDS[Math.floor(r() * CARDS.length)] ?? 'NONE',
      target: r() < 0.9 ? (others[Math.floor(r() * others.length)]?.id ?? null) : null,
    };
  }
  return out;
}

/** Random pact activity, audit requests and disclosure toggles between quarters. */
function perturb(s: EngineState, r: Rng): void {
  if (r() < 0.2) {
    const members = s.firms.filter(() => r() < 0.4).map((f) => f.id);
    const id = `p${s.pacts.length}`;
    s.pacts.push({
      id,
      name: nextPactName(s.pacts),
      proposer: members[0] ?? s.firms[0]!.id,
      terms: { maxPace: r() < 0.7 ? ((1 + Math.floor(r() * 4)) as Pace) : null, minSafety: r() < 0.5 ? Math.floor(r() * 31) : null },
      members: Object.fromEntries(members.map((m) => [m, s.round + 1])),
      createdRound: s.round + 1,
      status: 'active',
    });
  }
  for (const pact of s.pacts) {
    if (r() < 0.1) for (const f of s.firms) if (r() < 0.3) pact.members[f.id] = s.round + 1;
    if (r() < 0.1) for (const id of Object.keys(pact.members)) if (r() < 0.3) delete pact.members[id];
    if (r() < 0.15) s.pendingAudits.push(pact.id);
  }
  if (r() < 0.15) s.disclosure = !s.disclosure;
}

interface Run {
  states: EngineState[];
  lines: string[];
}

function playRandom(seed: number, n: number, rounds: number): Run {
  const r = mulberry32(seed * 7919 + n);
  let s = game(n, { seed, settings: { autoAuditP: 0.25, endMode: 'manual' } });
  if (r() < 0.5) s.firms.forEach((f, i) => {
    if (i % 3 === 0) {
      f.isBot = true;
      f.botPolicy = (['cautious', 'standard', 'greedy', 'mimic-leader'] as const)[i % 4] ?? 'greedy';
    }
  });
  const states: EngineState[] = [];
  const lines: string[] = [];
  for (let i = 0; i < rounds; i++) {
    perturb(s, r);
    const res = resolveRound(s, randomDecisions(s, r));
    s = res.state;
    states.push(s);
    lines.push(...res.dataLines);
  }
  return { states, lines };
}

const CASES: Array<[number, number]> = [];
for (const n of [2, 4, 6, 8, 10, 12, 16]) for (let seed = 1; seed <= 12; seed++) CASES.push([seed, n]);

describe('engine properties', () => {
  it('T stays within [0, 100]', () => {
    for (const [seed, n] of CASES) {
      for (const s of playRandom(seed, n, 30).states) {
        expect(s.T).toBeGreaterThanOrEqual(0);
        expect(s.T).toBeLessThanOrEqual(100);
      }
    }
  });

  it('shares sum to 1 ± 1e-9', () => {
    for (const [seed, n] of CASES) {
      for (const s of playRandom(seed, n, 20).states) {
        const rec = s.history[s.history.length - 1]!;
        const sum = Object.values(rec.firms).reduce((x, f) => x + f.share, 0);
        expect(Math.abs(sum - 1)).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('the same seed gives identical output', () => {
    for (const [seed, n] of CASES.filter((_, i) => i % 3 === 0)) {
      const a = playRandom(seed, n, 16);
      const b = playRandom(seed, n, 16);
      expect(b.states).toEqual(a.states);
      expect(b.lines).toEqual(a.lines);
    }
  });

  it('a different seed gives different output', () => {
    expect(playRandom(1, 8, 10).lines).not.toEqual(playRandom(2, 8, 10).lines);
  });

  it("the counterfactual's incident draws match the actual run's", () => {
    for (const [seed, n] of CASES.filter((_, i) => i % 2 === 0)) {
      const run = playRandom(seed, n, 14);
      const final = run.states[run.states.length - 1]!;
      const cf = runCounterfactual(final);
      expect(cf.rounds).toBe(final.round);
      expect(cf.incidentDraws).toEqual(final.history.map((h) => h.incidentDraws));
    }
  });

  it('cash, capability and valuation stay finite', () => {
    for (const [seed, n] of CASES) {
      const run = playRandom(seed, n, 30);
      for (const f of run.states[run.states.length - 1]!.firms) {
        expect(Number.isFinite(f.cash)).toBe(true);
        expect(Number.isFinite(f.valuation)).toBe(true);
        expect(f.cap).toBeGreaterThanOrEqual(10);
      }
    }
  });
});
