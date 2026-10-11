/** NET CONTRIBUTION (spec §10, Session 18): the additive method against the ALTERNATIVE policy. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARAMS, buildResults, createGame, resolveRound, type Decision, type EngineState, type Params } from '../../src/engine';
import { blitzTaken, computeContribution, trustPointValue, type Contribution } from '../../src/engine/contribution';
import { observedRoom, parseObserved } from '../../tools/calibration/scenarios';
import { SETTINGS, dec, firms, game } from './helpers';

const p = PARAMS;
const ALT = dec(2, 15);

/** Plays `rounds` quarters; `decide(r, state)` gives each firm's decision for quarter r (1-based). */
function play(state: EngineState, rounds: number, decide: (r: number, s: EngineState) => Record<string, Decision>, params: Params = p): EngineState {
  let s = state;
  for (let r = 1; r <= rounds; r++) s = resolveRound(s, decide(r, s), params).state;
  return s;
}
const everyone = (s: EngineState, d: Decision): Record<string, Decision> => Object.fromEntries(s.firms.map((f) => [f.id, d]));
const identities = (c: Contribution): void => {
  for (const f of Object.values(c.firms)) {
    expect(f.netContribution).toBeCloseTo(f.valuation + f.marketEffect + f.researchCredit - f.rivalryTaken, 9);
    expect(f.valueCreated - f.damageCreated).toBeCloseTo(f.netContribution, 9);
    expect(f.rivalryTaken).toBeCloseTo(f.rivalry.blitz + f.rivalry.poach + f.rivalry.rush, 9);
    expect(Number.isFinite(f.netContribution)).toBe(true);
  }
  const ranks = Object.values(c.firms).map((f) => f.rank).sort((a, b) => a - b);
  expect(ranks).toEqual(ranks.map((_, i) => i + 1));
};

describe('the ALTERNATIVE baseline', () => {
  it('gives a firm on the ALTERNATIVE policy a market effect of exactly 0, with real incident draws', () => {
    for (const seed of [1, 2, 3]) {
      const s = play(game(6, { seed }), 12, (_, st) => everyone(st, ALT));
      const c = computeContribution(s);
      for (const f of Object.values(c.firms)) {
        expect(f.marketEffect).toBe(0);
        expect(f.trustPoints).toBe(0);
        expect(f.researchCredit).toBe(0);
        expect(f.rivalryTaken).toBe(0);
        expect(f.netContribution).toBe(f.valuation);
      }
    }
  });

  it('keeps it exactly 0 among racing firms, other firms’ SHARE cards included', () => {
    const s = play(game(5, { seed: 4 }), 10, (r) => ({
      f0: ALT,
      f1: dec(4, 0, r % 2 ? 'BLITZ' : 'NONE'),
      f2: dec(3, 5, r % 2 ? 'SHARE' : 'RUSH'),
      f3: dec(1, 30, r % 2 ? 'PUBLISH' : 'NONE'),
      f4: dec(4, 0, r % 2 ? 'POACH' : 'LOBBY', r % 2 ? 'f1' : null),
    }));
    const c = computeContribution(s);
    // A moratorium (here in quarter 6) is allocated only to negative firms, so the ALTERNATIVE firm stays at 0.
    expect(c.firms.f0?.moratoriumShare).toBe(0);
    expect(c.firms.f0?.marketEffect).toBe(0);
    expect(c.firms.f1!.marketEffect).toBeLessThan(0);
    expect(c.firms.f3!.marketEffect).toBeGreaterThan(0);
    identities(c);
  });

  it('charges an incident only when the ALTERNATIVE would have avoided it on the same draw', () => {
    const always: Params = { ...p, INC_BASE: [1, 1, 1, 1], SAFETY_INC_EFF: 0 };
    // Every draw is below q = 1 for both the firm and the ALTERNATIVE: the incident is not the firm's doing.
    const s = play(game(3), 1, (_, st) => ({ ...everyone(st, ALT), f0: dec(4, 0) }), always);
    const c = computeContribution(s, always);
    const rec = s.history[0]!;
    const scale = p.DRAW_REF_N / 3;
    const altDraw = p.DRAW[1] * (1 - p.SAFETY_DRAW_EFF * 0.5) * scale;
    expect(c.firms.f0!.trustPoints).toBeCloseTo(-rec.firms.f0!.draw + altDraw, 12);
  });
});

describe('the value of a trust point', () => {
  it('is γ × M_t / T_t for every quarter from t to the end', () => {
    expect(trustPointValue({ round: 3, T: 50, M: 400 }, 10, p)).toBeCloseTo((p.GAMMA * 400) / 50 * 8, 12);
    expect(trustPointValue({ round: 10, T: 50, M: 400 }, 10, p)).toBeCloseTo((p.GAMMA * 400) / 50, 12);
    expect(trustPointValue({ round: 1, T: 0, M: 0 }, 10, p)).toBe(0);
  });
});

describe('PUBLISH', () => {
  it('raises both the market effect and the research credit', () => {
    const decide = (pub: boolean) => (r: number, st: EngineState) => ({ ...everyone(st, ALT), f0: dec(2, 15, pub && r % 2 === 1 ? 'PUBLISH' : 'NONE') });
    const withPub = play(game(8, { seed: 5 }), 10, decide(true));
    const without = play(game(8, { seed: 5 }), 10, decide(false));
    const a = computeContribution(withPub).firms.f0!;
    const b = computeContribution(without).firms.f0!;
    expect(b.marketEffect).toBe(0);
    expect(b.researchCredit).toBe(0);
    expect(a.marketEffect).toBeGreaterThan(0);
    expect(a.researchCredit).toBeGreaterThan(0);
    expect(a.ledger.publish).toBe(5);
    // The credit: RESEARCH_CREDIT × 8/N × the value of a trust point in each PUBLISH quarter.
    const expected = withPub.history.filter((h) => h.firms.f0?.card === 'PUBLISH').reduce((s, h) => s + p.RESEARCH_CREDIT * (8 / 8) * trustPointValue(h, 10, p), 0);
    expect(a.researchCredit).toBeCloseTo(expected, 9);
    expect(p.RESEARCH_CREDIT).toBe(1);
  });
});

describe('rivalry taken', () => {
  it('BLITZ: the firm’s revenue minus its revenue with shares recomputed without the multiplier', () => {
    const s = play(game(4, { seed: 2 }), 1, (_, st) => ({ ...everyone(st, ALT), f1: dec(3, 0, 'BLITZ'), f2: dec(2, 15, 'BLITZ') }));
    const rec = s.history[0]!;
    const w = (id: string, mult: number) => Math.pow(rec.firms[id]!.cap * mult, p.ALPHA);
    const total = w('f0', 1) + w('f1', p.BLITZ_MULT) + w('f2', p.BLITZ_MULT) + w('f3', 1);
    const shareWithout = w('f1', 1) / (total - w('f1', p.BLITZ_MULT) + w('f1', 1));
    const factor = rec.firms.f1!.incident ? 1 - p.INC_REV_LOSS : 1;
    const exact = (rec.firms.f1!.share - shareWithout) * rec.M * factor;
    expect(blitzTaken(rec, 'f1', ['f0', 'f1', 'f2', 'f3'], p)).toBeCloseTo(exact, 9);
    expect(exact).toBeGreaterThan(0);
    expect(blitzTaken(rec, 'f0', ['f0', 'f1', 'f2', 'f3'], p)).toBe(0);
    expect(computeContribution(s).firms.f1!.rivalry.blitz).toBeCloseTo(exact, 9);
  });

  it('POACH and RUSH: the capability moved, at CAP_MULT × final trust', () => {
    const s = play(game(4, { seed: 3 }), 3, (r, st) => ({ ...everyone(st, ALT), f0: dec(2, 15, r === 2 ? 'NONE' : 'POACH', 'f1'), f2: dec(2, 15, r === 2 ? 'RUSH' : 'NONE') }));
    const c = computeContribution(s);
    // The second POACH on the same target is dropped by the repeat rule (§5.2), so one completed POACH counts.
    expect(s.history.filter((h) => h.firms.f0?.card === 'POACH')).toHaveLength(1);
    expect(c.firms.f0!.rivalry.poach).toBeCloseTo(p.POACH_LOSS * p.CAP_MULT * (s.T / 100), 12);
    expect(c.firms.f2!.rivalry.rush).toBeCloseTo(p.RUSH_CAP_GAIN * p.CAP_MULT * (s.T / 100), 12);
    expect(c.firms.f0!.ledger.poach).toBe(1);
    expect(c.firms.f2!.ledger.rush).toBe(1);
  });
});

describe('SHARE benefit', () => {
  it('values the incident trust loss SHARE saved the other firms, in expectation', () => {
    const s = play(game(4, { seed: 7 }), 1, (_, st) => ({ ...everyone(st, dec(4, 0)), f3: dec(2, 15, 'SHARE') }));
    const c = computeContribution(s);
    const rec = s.history[0]!;
    const q = p.INC_BASE[3] * 1;
    const expected = 3 * q * (1 - p.SHARE_INC_MULT) * p.INC_TRUST * (8 / 4) * trustPointValue(rec, 1, p);
    expect(c.firms.f3!.shareBenefit).toBeCloseTo(expected, 9);
    expect(c.firms.f3!.ledger.share).toBe(1);
  });
});

describe('moratorium cost', () => {
  const greedy = (seed: number, n: number) => play(game(n, { seed }), 14, (_, st) => everyone(st, dec(4, 0, 'NONE')));

  it('is allocated in full to firms with a negative effect by the moratorium quarter', () => {
    const s = greedy(1, 8);
    expect(s.collapseRound).not.toBeNull();
    const c = computeContribution(s);
    const m = c.moratorium!;
    expect(m.round).toBe(s.collapseRound);
    expect(m.revenue).toBeGreaterThan(0);
    // Capability written down at final trust: CAP_MULT × Σ C × T/100 × (1 − retained).
    const cap = s.firms.reduce((a, f) => a + p.CAP_MULT * f.cap * (s.T / 100) * (1 - p.COLLAPSE_CAP_WRITEDOWN), 0);
    expect(m.capability).toBeCloseTo(cap, 9);
    expect(m.total).toBeCloseTo(m.revenue + m.cash + m.capability, 9);
    expect(m.allocated).toBe(m.total);
    const sum = Object.values(c.firms).reduce((a, f) => a + f.moratoriumShare, 0);
    expect(sum).toBeCloseTo(m.total, 6);
    identities(c);
  });

  it('counts revenue lost in every quarter whose market carries the multiplier', () => {
    const s = greedy(2, 6);
    const c = computeContribution(s);
    const lost = s.history.filter((h) => h.collapsed).reduce((a, h) => a + h.M / p.MORATORIUM_M - h.M, 0);
    expect(c.moratorium?.revenue).toBeCloseTo(lost, 9);
    expect(s.history.find((h) => h.round === s.collapseRound)?.collapsed).toBe(true);
  });

  it('is null without a moratorium', () => {
    expect(computeContribution(play(game(4), 5, (_, st) => everyone(st, ALT))).moratorium).toBeNull();
  });
});

describe('ranking and edge cases', () => {
  it('is deterministic', () => {
    const s = greedy3();
    expect(computeContribution(s)).toEqual(computeContribution(structuredClone(s)));
    expect(buildResults(s, { revealTau: false }).contribution).toEqual(buildResults(s, { revealTau: false }).contribution);
  });

  it('breaks ties by final cash, then creation order', () => {
    const s = play(game(3), 4, (_, st) => everyone(st, ALT));
    const c = computeContribution(s);
    // Identical firms: identical figures, ranked in creation order.
    expect(c.firms.f0!.netContribution).toBe(c.firms.f1!.netContribution);
    expect([c.firms.f0!.rank, c.firms.f1!.rank, c.firms.f2!.rank]).toEqual([1, 2, 3]);
  });

  it('ranks negative totals like any others', () => {
    const s = play(game(4, { seed: 9 }), 14, (_, st) => everyone(st, dec(4, 0, 'NONE')));
    const c = computeContribution(s);
    expect(Object.values(c.firms).some((f) => f.netContribution < 0)).toBe(true);
    identities(c);
  });

  it('handles N = 2 and N = 50', () => {
    for (const n of [2, 50]) {
      const s = play(game(n, { seed: n }), 8, (r, st) =>
        Object.fromEntries(st.firms.map((f, i) => [f.id, i % 3 === 0 ? dec(4, 0, r % 2 ? 'BLITZ' : 'RUSH') : i % 3 === 1 ? ALT : dec(1, 30, r % 2 ? 'PUBLISH' : 'SHARE')])),
      );
      const c = computeContribution(s);
      expect(Object.keys(c.firms)).toHaveLength(n);
      identities(c);
    }
  });

  it('counts the conduct ledger', () => {
    let s = play(game(3), 4, (r) => ({ f0: ALT, f1: dec(4, 0, r % 2 ? 'BLITZ' : 'LOBBY'), f2: dec(1, 20) }));
    s = structuredClone(s);
    s.pactsPrivate = {
      p1: {
        violations: { '2': { f1: true }, '3': { f1: true } },
        detected: { '2': { f1: true } },
        checked: { '1': { f0: true, f1: true }, '2': { f0: true, f1: true }, '3': { f0: true, f1: true }, '4': { f0: true } },
        sanctions: {},
        lastAuditRound: 2,
      },
    };
    const c = computeContribution(s);
    expect(c.firms.f0!.ledger).toMatchObject({ restraint: 4, compliant: 3, breaches: 0 });
    expect(c.firms.f1!.ledger).toMatchObject({ restraint: 0, compliant: 1, breaches: 2, blitz: 2, lobby: 2 });
    // Pace 1 and safety 20 is restraint (pace ≤ 2, safety ≥ 15).
    expect(c.firms.f2!.ledger.restraint).toBe(4);
  });
});

describe('the observed-human room (fixture, seed 1, N = 10)', () => {
  it('ranks firms by net contribution differently from valuation', () => {
    const live = parseObserved(JSON.parse(readFileSync('tools/calibration/observed-human.json', 'utf8')));
    const setups = observedRoom(live, 1, 10);
    let s = createGame({ ...SETTINGS, endMode: 'manual' }, firms(10), 1, p);
    for (let r = 0; r < 14; r++) {
      const d: Record<string, Decision> = {};
      setups.forEach((x, i) => {
        if (x.kind === 'script') d[`f${i}`] = x.at(r, s, `f${i}`);
      });
      s = resolveRound(s, d, p).state;
    }
    const c = computeContribution(s);
    const byValuation = Object.values(c.firms).sort((a, b) => a.valuationRank - b.valuationRank).map((f) => f.firmId);
    const byNet = Object.values(c.firms).sort((a, b) => a.rank - b.rank).map((f) => f.firmId);
    expect(byNet).not.toEqual(byValuation);
    identities(c);
  });
});

function greedy3(): EngineState {
  return play(game(6, { seed: 3 }), 14, (r, st) => Object.fromEntries(st.firms.map((f, i) => [f.id, i % 2 ? dec(4, 0, r % 2 ? 'BLITZ' : 'NONE') : ALT])));
}
