import { describe, expect, it } from 'vitest';
import { byPace, PARAMS, resolveRound, type Params } from '../../src/engine';
import { all, dec, firm, game, NO_INC } from './helpers';

const p = PARAMS;
const sigma = (s: number) => s / p.SAFETY_MAX;

describe('createGame', () => {
  it('draws tau in range and endRound per end mode', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = game(4, { seed });
      expect(g.tau).toBeGreaterThanOrEqual(p.TAU_MIN);
      expect(g.tau).toBeLessThan(p.TAU_MAX);
      expect(g.endRound).toBeGreaterThanOrEqual(p.END_MIN);
      expect(g.endRound).toBeLessThanOrEqual(p.END_MAX);
      expect(Number.isInteger(g.endRound)).toBe(true);
    }
    expect(game(4, { settings: { endMode: 'manual' } }).endRound).toBeNull();
    expect(game(4, { settings: { endMode: 'fixed', fixedEnd: 7 } }).endRound).toBe(7);
    expect(game(4, { settings: { endMode: 'fixed', fixedEnd: 99 } }).endRound).toBe(p.MAX_ROUNDS);
    expect(game(4, { settings: { maxEnd: 99, minEnd: 29 } }).endRound).toBeLessThanOrEqual(p.MAX_ROUNDS);
  });

  it('is deterministic per seed, and tau differs across seeds', () => {
    expect(game(4, { seed: 9 })).toEqual(game(4, { seed: 9 }));
    expect(game(4, { seed: 9 }).tau).not.toBe(game(4, { seed: 10 }).tau);
  });

  it('starts every firm at CASH0 and C0 with round-1 defaults', () => {
    const g = game(3);
    expect(g.round).toBe(0);
    expect(g.T).toBe(p.T0);
    for (const f of g.firms) {
      expect(f.cash).toBe(p.CASH0);
      expect(f.cap).toBe(p.C0);
      expect(f.lastPace).toBe(p.DEFAULT_PACE);
      expect(f.lastSafety).toBe(p.DEFAULT_SAFETY);
    }
  });
});

describe('step 1: defaults', () => {
  it('round 1 uses pace 2, safety 10, card NONE, flagged AUTO', () => {
    const r = resolveRound(game(3), {});
    for (const fr of Object.values(r.outputs.firms)) {
      expect(fr).toMatchObject({ pace: p.DEFAULT_PACE, safety: p.DEFAULT_SAFETY, card: 'NONE', auto: true });
    }
  });

  it('later rounds keep the previous pace and safety, without the card', () => {
    const g = game(3);
    const r1 = resolveRound(g, { f0: dec(4, 3, 'BLITZ') });
    const r2 = resolveRound(r1.state, {});
    expect(r2.outputs.firms.f0).toMatchObject({ pace: 4, safety: 3, card: 'NONE', auto: true });
    expect(r1.outputs.firms.f0?.auto).toBe(false);
  });

  it('insolvent firms are forced to pace 1 and their card is converted with a notice', () => {
    const g = game(3);
    firm(g, 'f1').insolvent = true;
    const r = resolveRound(g, { f1: dec(4, 0, 'BLITZ') });
    expect(r.outputs.firms.f1).toMatchObject({ pace: 1, card: 'NONE' });
    expect(r.outputs.notices).toContainEqual({ firmId: 'f1', kind: 'card-insolvent', card: 'BLITZ' });
  });

  it('coerces out-of-range input', () => {
    const r = resolveRound(game(2), { f0: { pace: 9 as 1, safety: 47.6, card: 'X' as 'NONE', target: null } });
    expect(r.outputs.firms.f0).toMatchObject({ pace: p.DEFAULT_PACE, safety: p.SAFETY_MAX, card: 'NONE' });
  });
});

describe('step 2: card validation', () => {
  it('blocks the same card in consecutive quarters', () => {
    const r1 = resolveRound(game(3), { f0: dec(2, 10, 'PUBLISH') });
    const r2 = resolveRound(r1.state, { f0: dec(2, 10, 'PUBLISH') });
    expect(r2.outputs.firms.f0?.card).toBe('NONE');
    expect(r2.outputs.notices).toContainEqual({ firmId: 'f0', kind: 'card-cooldown', card: 'PUBLISH' });
    const r3 = resolveRound(r2.state, { f0: dec(2, 10, 'PUBLISH') });
    expect(r3.outputs.firms.f0?.card).toBe('PUBLISH');
  });

  it('requires a valid other POACH target, and not the previous POACH target', () => {
    const g = game(3);
    for (const target of [null, 'f0', 'nobody']) {
      const r = resolveRound(g, { f0: dec(2, 10, 'POACH', target) });
      expect(r.outputs.firms.f0?.card).toBe('NONE');
      expect(r.outputs.notices[0]?.kind).toBe('card-target');
    }
    const r1 = resolveRound(g, { f0: dec(2, 10, 'POACH', 'f1') });
    expect(r1.outputs.firms.f0).toMatchObject({ card: 'POACH', target: 'f1' });
    const r2 = resolveRound(r1.state, {});
    const r3 = resolveRound(r2.state, { f0: dec(2, 10, 'POACH', 'f1') });
    expect(r3.outputs.notices).toContainEqual({ firmId: 'f0', kind: 'card-target-repeat', card: 'POACH' });
    const r3b = resolveRound(r2.state, { f0: dec(2, 10, 'POACH', 'f2') });
    expect(r3b.outputs.firms.f0?.card).toBe('POACH');
  });

  it('an invalidated card costs nothing', () => {
    const g = game(3);
    firm(g, 'f0').lastCard = 'BLITZ';
    const r = resolveRound(g, { f0: dec(2, 10, 'BLITZ'), f1: dec(2, 10) });
    expect(r.outputs.firms.f0?.cost).toBe(r.outputs.firms.f1?.cost);
  });
});

describe('step 3: capability', () => {
  it('grows by CAP_GAIN[p] × (1 − drag × σ)', () => {
    const r = resolveRound(game(4), { f0: dec(1, 0), f1: dec(2, 15), f2: dec(3, 30), f3: dec(4, 7) });
    const exp = (pace: 1 | 2 | 3 | 4, s: number) => p.C0 + byPace(p.CAP_GAIN, pace) * (1 - p.SAFETY_CAP_DRAG * sigma(s));
    expect(r.outputs.firms.f0?.cap).toBeCloseTo(exp(1, 0), 12);
    expect(r.outputs.firms.f1?.cap).toBeCloseTo(exp(2, 15), 12);
    expect(r.outputs.firms.f2?.cap).toBeCloseTo(exp(3, 30), 12);
    expect(r.outputs.firms.f3?.cap).toBeCloseTo(exp(4, 7), 12);
  });

  it('POACH moves capability from the target, floored for the target', () => {
    const g = game(3);
    const base = resolveRound(g, all(g, dec(2, 10)));
    const r = resolveRound(g, { f0: dec(2, 10, 'POACH', 'f1'), f1: dec(2, 10), f2: dec(2, 10) });
    expect(r.outputs.firms.f0!.cap - base.outputs.firms.f0!.cap).toBeCloseTo(p.POACH_GAIN, 12);
    expect(base.outputs.firms.f1!.cap - r.outputs.firms.f1!.cap).toBeCloseTo(p.POACH_LOSS, 12);
    const low = game(3);
    firm(low, 'f1').cap = p.POACH_FLOOR - 0.5 - byPace(p.CAP_GAIN, 1);
    const r2 = resolveRound(low, { f0: dec(2, 10, 'POACH', 'f1'), f1: dec(1, 0) });
    expect(r2.outputs.firms.f1?.cap).toBe(p.POACH_FLOOR);
  });
});

describe('step 4: trust draw', () => {
  it('d_i = DRAW[p] × (1 − eff × σ), scaled by 8/N into cumulativeDraw', () => {
    const g = game(5);
    const r = resolveRound(g, { f0: dec(3, 12) });
    const d = byPace(p.DRAW, 3) * (1 - p.SAFETY_DRAW_EFF * sigma(12));
    expect(r.outputs.firms.f0?.expo).toBeCloseTo(d, 12);
    expect(r.outputs.firms.f0?.draw).toBeCloseTo((d * p.DRAW_REF_N) / 5, 12);
    expect(firm(r.state, 'f0').cumulativeDraw).toBeCloseTo((d * p.DRAW_REF_N) / 5, 12);
  });
});

describe('step 5: incidents', () => {
  it('fires when u < q and scales with safety and PUBLISH', () => {
    const always: Params = { ...p, INC_BASE: [1, 1, 1, 1], SAFETY_INC_EFF: 0 };
    const r = resolveRound(game(4, { p: always }), {}, always);
    expect(r.outputs.incidents).toBe(4);
    const never: Params = { ...p, INC_BASE: [0, 0, 0, 0] };
    expect(resolveRound(game(4), {}, never).outputs.incidents).toBe(0);
    const half: Params = { ...always };
    for (let seed = 1; seed <= 20; seed++) {
      const g = game(4, { seed });
      const rr = resolveRound(g, all(g, dec(2, 0, 'PUBLISH')), half);
      rr.outputs.incidentDraws.forEach((u, i) => {
        expect(rr.outputs.firms[`f${i}`]?.incident).toBe(u < p.PUBLISH_INC_MULT);
      });
    }
  });

  it('cuts the firm revenue by INC_REV_LOSS', () => {
    const always: Params = { ...p, INC_BASE: [1, 1, 1, 1], SAFETY_INC_EFF: 0 };
    const out = resolveRound(game(2), {}, always).outputs;
    const a = out.firms.f0!;
    expect(a.incident).toBe(true);
    expect(a.revenue).toBeCloseTo(a.share * out.M * (1 - p.INC_REV_LOSS), 9);
  });
});

describe('step 6: trust update', () => {
  it('applies logistic regeneration, draw, incidents and card effects', () => {
    const g = game(4);
    const ds = { f0: dec(3, 5, 'PUBLISH'), f1: dec(2, 10, 'LOBBY'), f2: dec(1, 20), f3: dec(4, 0) };
    const r = resolveRound(g, ds, NO_INC);
    const D = Object.values(r.outputs.firms).reduce((x, f) => x + f.draw, 0);
    const T0 = p.T0;
    const expected = T0 + p.R * T0 * (1 - T0 / 100) - D + p.PUBLISH_TRUST * (p.DRAW_REF_N / 4) - p.LOBBY_TRUST;
    expect(r.outputs.T).toBeCloseTo(Math.max(0, Math.min(100, expected)), 10);
  });

  it('incidents subtract INC_TRUST × 8/N each', () => {
    const always: Params = { ...p, INC_BASE: [1, 1, 1, 1], SAFETY_INC_EFF: 0 };
    const g = game(4);
    g.tau = 0;
    const a = resolveRound(g, {}, always).outputs.T;
    const b = resolveRound(g, {}, NO_INC).outputs.T;
    expect(b - a).toBeCloseTo(4 * p.INC_TRUST * (p.DRAW_REF_N / 4), 9);
  });

  it('uses R × MORATORIUM_R after the moratorium', () => {
    const g = game(4);
    g.collapsed = true;
    g.collapseRound = 0;
    g.T = 50;
    const r = resolveRound(g, all(g, dec(1, 30)), NO_INC);
    const D = Object.values(r.outputs.firms).reduce((x, f) => x + f.draw, 0);
    expect(r.outputs.T).toBeCloseTo(50 + p.R * p.MORATORIUM_R * 50 * 0.5 - D, 10);
  });

  it('clamps to [0, 100]', () => {
    const g = game(4);
    g.T = 1;
    expect(resolveRound(g, all(g, dec(4, 0)), NO_INC).outputs.T).toBe(0);
    const up: Params = { ...NO_INC, DRAW: [0, 0, 0, 0], PUBLISH_TRUST: 50 };
    const h = game(4);
    h.T = 99;
    expect(resolveRound(h, all(h, dec(1, 0, 'PUBLISH')), up).outputs.T).toBe(100);
  });
});

describe('step 7: moratorium', () => {
  it('triggers below tau with backlash, positive-cash haircut and records the round', () => {
    const g = game(3);
    g.tau = 99;
    firm(g, 'f2').cash = -500;
    const r = resolveRound(g, all(g, dec(2, 10)), NO_INC);
    const ref = resolveRound({ ...g, tau: 0 }, all(g, dec(2, 10)), NO_INC);
    expect(r.outputs.collapsed).toBe(true);
    expect(r.outputs.collapsedNow).toBe(true);
    expect(r.state.collapseRound).toBe(1);
    expect(r.outputs.T).toBeCloseTo(Math.max(0, ref.outputs.T - p.BACKLASH), 10);
    const f0 = r.outputs.firms.f0!;
    expect(f0.cash).toBeCloseTo(p.CASH0 * p.COLLAPSE_CASH_HAIRCUT + f0.profit, 9);
    const f2 = r.outputs.firms.f2!;
    expect(f2.cash).toBeCloseTo(-500 + f2.profit, 9);
    expect(r.outputs.headlines[0]?.kind).toBe('collapse');
  });

  it('triggers once only', () => {
    const g = game(3);
    g.tau = 99;
    const r1 = resolveRound(g, {}, NO_INC);
    const r2 = resolveRound(r1.state, {}, NO_INC);
    expect(r2.outputs.collapsedNow).toBe(false);
    expect(r2.state.collapseRound).toBe(1);
    expect(r2.outputs.headlines[0]?.kind).toBe('moratorium');
  });
});

describe('steps 8–10: market, share, P&L', () => {
  it('computes M, contest shares with BLITZ, revenue, cost and profit', () => {
    const g = game(3);
    const r = resolveRound(g, { f0: dec(4, 0, 'BLITZ'), f1: dec(2, 10), f2: dec(1, 30, 'PUBLISH') }, NO_INC);
    const T = r.outputs.T;
    expect(r.outputs.M).toBeCloseTo(p.M_PER_FIRM * 3 * Math.pow(T / 100, p.GAMMA), 9);
    const caps = ['f0', 'f1', 'f2'].map((id) => r.outputs.firms[id]!.cap);
    const w = caps.map((c, i) => Math.pow(c * (i === 0 ? p.BLITZ_MULT : 1), p.ALPHA));
    const tot = w.reduce((a, b) => a + b, 0);
    ['f0', 'f1', 'f2'].forEach((id, i) => {
      const fr = r.outputs.firms[id]!;
      expect(fr.share).toBeCloseTo(w[i]! / tot, 12);
      expect(fr.revenue).toBeCloseTo(fr.share * r.outputs.M, 9);
      expect(fr.profit).toBeCloseTo(fr.revenue - fr.cost, 9);
      expect(fr.cash).toBeCloseTo(p.CASH0 + fr.profit, 9);
    });
    expect(r.outputs.firms.f0!.cost).toBe(byPace(p.COMPUTE_COST, 4) + 0 + p.CARD_COST.BLITZ);
    expect(r.outputs.firms.f2!.cost).toBe(byPace(p.COMPUTE_COST, 1) + 30 * p.BUDGET_REF + p.CARD_COST.PUBLISH);
  });

  it('multiplies the market by MORATORIUM_M after the moratorium', () => {
    const g = game(3);
    g.collapsed = true;
    const r = resolveRound(g, {}, NO_INC);
    expect(r.outputs.M).toBeCloseTo(p.M_PER_FIRM * 3 * Math.pow(r.outputs.T / 100, p.GAMMA) * p.MORATORIUM_M, 9);
  });
});

describe('steps 12–14: insolvency, valuation, rank', () => {
  it('insolvency is set below the line and is sticky', () => {
    const g = game(3);
    firm(g, 'f0').cash = p.INSOLVENCY - 500;
    const r1 = resolveRound(g, {});
    expect(r1.outputs.firms.f0?.insolvent).toBe(true);
    expect(r1.outputs.headlines.some((h) => h.kind === 'insolvency')).toBe(true);
    firm(r1.state, 'f0').cash = 10_000;
    const r2 = resolveRound(r1.state, { f0: dec(4, 0) });
    expect(r2.outputs.firms.f0).toMatchObject({ insolvent: true, pace: 1 });
  });

  it('valuation = cash + CAP_MULT × C × T/100, written down after the moratorium', () => {
    const r = resolveRound(game(3), {});
    const f = r.outputs.firms.f0!;
    expect(f.valuation).toBeCloseTo(f.cash + p.CAP_MULT * f.cap * (r.outputs.T / 100), 9);
    const g = game(3);
    g.tau = 99;
    const c = resolveRound(g, {}).outputs;
    const fc = c.firms.f0!;
    expect(fc.valuation).toBeCloseTo(fc.cash + p.CAP_MULT * fc.cap * (c.T / 100) * p.COLLAPSE_CAP_WRITEDOWN, 9);
  });

  it('ranks by valuation, then cash, then creation order', () => {
    const r = resolveRound(game(4), {}, NO_INC);
    expect(['f0', 'f1', 'f2', 'f3'].map((id) => r.outputs.firms[id]?.rank)).toEqual([1, 2, 3, 4]);
    firm(r.state, 'f3').cash += 1000;
    const r2 = resolveRound(r.state, {}, NO_INC);
    expect(r2.outputs.firms.f3?.rank).toBe(1);
    expect(r2.outputs.firms.f3?.rankDelta).toBe(3);
    expect(r2.outputs.firms.f0?.rankDelta).toBe(-1);
    expect(r.outputs.firms.f0?.rankDelta).toBe(0);
    expect(r2.outputs.headlines.some((h) => h.kind === 'rank')).toBe(true);
  });
});

describe('steps 15–16: headlines and DATA lines', () => {
  it('emits 2–4 headlines every round', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = game(8, { seed, policy: 'greedy' });
      for (let i = 0; i < 14; i++) {
        const r = resolveRound(s, {});
        expect(r.outputs.headlines.length).toBeGreaterThanOrEqual(p.HEADLINES_MIN);
        expect(r.outputs.headlines.length).toBeLessThanOrEqual(p.HEADLINES_MAX);
        s = r.state;
      }
    }
  });

  it('marks the final round', () => {
    let s = game(3, { settings: { endMode: 'fixed', fixedEnd: 2 } });
    s = resolveRound(s, {}).state;
    const r = resolveRound(s, {});
    expect(r.outputs.finalRound).toBe(true);
    expect(r.outputs.headlines.some((h) => h.kind === 'final')).toBe(true);
  });

  it('writes one DATA line per firm in the §8.4 format', () => {
    const r = resolveRound(game(3, { policy: 'greedy' }), {});
    expect(r.dataLines).toHaveLength(3);
    const re =
      /^DATA\|game=TEST\|round=1\|T=-?\d+\.\d{2}\|M=\d+\.\d\|collapsed=[01]\|firm=[A-Z]+\|bot=1\|pace=[1-4]\|safety=\d+\|card=(NONE|POACH|PUBLISH|LOBBY|BLITZ)\|share=\d\.\d{3}\|rev=-?\d+\.\d\|cost=\d+\.\d\|profit=-?\d+\.\d\|cash=-?\d+\.\d\|cap=\d+\.\d\|val=-?\d+\.\d\|draw=\d+\.\d{2}\|incident=[01]\|auto=0$/;
    for (const line of r.dataLines) expect(line).toMatch(re);
  });

  it('appends a history record and advances the round', () => {
    const r = resolveRound(game(3), {});
    expect(r.state.round).toBe(1);
    expect(r.state.history).toHaveLength(1);
    expect(r.state.history[0]?.T).toBe(r.outputs.T);
  });

  it('returns outputs that do not alias the new state', () => {
    const r = resolveRound(game(3), {});
    r.outputs.firms.f0!.cash = -1;
    r.outputs.headlines.length = 0;
    expect(r.state.history[0]?.firms.f0?.cash).not.toBe(-1);
    expect(r.state.history[0]?.headlines.length).toBeGreaterThan(0);
  });

  it('does not mutate the input state', () => {
    const g = game(3);
    const copy = structuredClone(g);
    resolveRound(g, all(g, dec(4, 0, 'BLITZ')));
    expect(g).toEqual(copy);
  });
});
