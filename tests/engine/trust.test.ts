/** trustBreakdown (spec §6.3 steps 6–7; QUARTER BRIEF, §14.2, Session 19). */
import { describe, expect, it } from 'vitest';
import {
  breakdownSum,
  CARDS,
  createGame,
  mulberry32,
  PARAMS,
  resolveRound,
  trustBreakdown,
  type Decision,
  type EngineState,
  type Pace,
  type Params,
  type Rng,
  type TrustBreakdown,
} from '../../src/engine';
import { all, dec, firms, NO_INC, SETTINGS } from './helpers';

const EPS = 1e-9;
/** No recovery, no draw, no incidents: isolates one term at a time. */
const QUIET: Params = { ...NO_INC, R: 0, DRAW: [0, 0, 0, 0] };
/** The hidden level set out of reach, so no moratorium starts. */
const NO_MOR = { TAU_MIN: -1, TAU_MAX: -1 };

function start(n: number, p: Params, seed = 1): EngineState {
  return createGame(SETTINGS, firms(n), seed, p);
}

function one(s: EngineState, d: Record<string, Decision>, p: Params): { s: EngineState; b: TrustBreakdown } {
  const next = resolveRound(s, d, p).state;
  const b = trustBreakdown(next.history, next.round, p);
  if (!b) throw new Error('no breakdown');
  return { s: next, b };
}

function expectSums(b: TrustBreakdown): void {
  expect(Math.abs(breakdownSum(b) - b.dT)).toBeLessThan(EPS);
  expect(Math.abs(b.from + b.dT - b.to)).toBeLessThan(EPS);
}

describe('trustBreakdown, each term on its own', () => {
  it('recovery: R × T × (1 − T/100) from T0 in quarter 1', () => {
    const p: Params = { ...QUIET, R: PARAMS.R };
    const { b } = one(start(4, p), all(start(4, p), dec(2, 10)), p);
    expect(b.from).toBe(p.T0);
    expect(b.recovery).toBeCloseTo(p.R * p.T0 * (1 - p.T0 / 100), 12);
    for (const t of [b.draw, b.incidents, b.publish, b.lobby, b.clamp, b.moratorium]) expect(Math.abs(t)).toBe(0);
    expectSums(b);
  });

  it('draw: minus the sum of every firm’s d_i × 8/N', () => {
    const p: Params = { ...NO_INC, R: 0 };
    const s0 = start(4, p);
    const { s, b } = one(s0, { f0: dec(4, 0), f1: dec(1, 30), f2: dec(2, 10), f3: dec(3, 5) }, p);
    const rec = s.history[0]!;
    const sum = Object.values(rec.firms).reduce((x, f) => x + f.draw, 0);
    expect(b.draw).toBeCloseTo(-sum, 12);
    expect(b.draw).toBeLessThan(0);
    expect(b.recovery).toBe(0);
    expectSums(b);
  });

  it('incidents: −INC_TRUST × 8/N per incident, naming the firms', () => {
    const p: Params = { ...QUIET, INC_BASE: [0, 0, 0, 1] };
    const s0 = start(5, p);
    const { b } = one(s0, { f0: dec(4, 0), f1: dec(1, 0), f2: dec(4, 0), f3: dec(1, 0), f4: dec(1, 0) }, p);
    expect(b.incidentFirms).toEqual(['f0', 'f2']);
    expect(b.incidents).toBeCloseTo(-2 * p.INC_TRUST * (8 / 5), 12);
    expectSums(b);
  });

  it('PUBLISH: +PUBLISH_TRUST × 8/N per card', () => {
    const p = QUIET;
    const { b } = one(start(4, p), { f0: dec(2, 10, 'PUBLISH'), f1: dec(2, 10, 'PUBLISH'), f2: dec(2, 10), f3: dec(2, 10) }, p);
    expect(b.publishFirms).toEqual(['f0', 'f1']);
    expect(b.publish).toBeCloseTo(2 * p.PUBLISH_TRUST * 2, 12);
    expect(b.dT).toBeCloseTo(b.publish, 12);
    expectSums(b);
  });

  it('LOBBY: −LOBBY_TRUST per card, not scaled by firm count', () => {
    const p = QUIET;
    const { b } = one(start(10, p), { ...all(start(10, p), dec(2, 10)), f3: dec(2, 10, 'LOBBY') }, p);
    expect(b.lobbyFirms).toEqual(['f3']);
    expect(b.lobby).toBe(-p.LOBBY_TRUST);
    expectSums(b);
  });
});

describe('trustBreakdown, combined and edge quarters', () => {
  it('a quarter with every term (no clamp) sums to dT', () => {
    const p: Params = { ...PARAMS, INC_BASE: [0, 0, 0, 1], ...NO_MOR };
    const s0 = start(6, p);
    const { b } = one(s0, { f0: dec(4, 0), f1: dec(2, 15, 'PUBLISH'), f2: dec(3, 5, 'LOBBY'), f3: dec(2, 10), f4: dec(1, 30), f5: dec(2, 0, 'RUSH') }, p);
    expect(b.recovery).toBeGreaterThan(0);
    expect(b.draw).toBeLessThan(0);
    expect(b.incidents).toBeLessThan(0);
    expect(b.publish).toBeGreaterThan(0);
    expect(b.lobby).toBeLessThan(0);
    expect(b.clamp).toBe(0);
    expect(b.moratorium).toBe(0);
    expectSums(b);
  });

  it('clamping at 0 shows the amount added back', () => {
    const p: Params = { ...NO_INC, T0: 2, ...NO_MOR };
    const s0 = start(4, p);
    const { b } = one(s0, all(s0, dec(4, 0)), p);
    expect(b.to).toBe(0);
    expect(b.clamp).toBeGreaterThan(0);
    expectSums(b);
  });

  it('clamping at 100 shows the amount removed', () => {
    const p: Params = { ...QUIET, T0: 99.9, PUBLISH_TRUST: 5 };
    const s0 = start(4, p);
    const { b } = one(s0, { ...all(s0, dec(2, 10)), f0: dec(2, 10, 'PUBLISH') }, p);
    expect(b.to).toBe(100);
    expect(b.clamp).toBeCloseTo(100 - (99.9 + 5 * 2), 9);
    expectSums(b);
  });

  it('the moratorium quarter carries −BACKLASH', () => {
    const p: Params = { ...NO_INC, TAU_MIN: 71, TAU_MAX: 71 };
    const s0 = start(4, p);
    const { b } = one(s0, all(s0, dec(4, 0)), p);
    expect(b.moratoriumNow).toBe(true);
    expect(b.moratorium).toBe(-p.BACKLASH);
    expectSums(b);
  });

  it('the moratorium drop is only what is left when T is below BACKLASH', () => {
    const p: Params = { ...NO_INC, T0: 6, TAU_MIN: 50, TAU_MAX: 50 };
    const s0 = start(4, p);
    const { b } = one(s0, all(s0, dec(1, 30)), p);
    expect(b.moratoriumNow).toBe(true);
    expect(b.to).toBe(0);
    expect(b.moratorium).toBeGreaterThan(-p.BACKLASH);
    expect(b.moratorium).toBeLessThan(0);
    expectSums(b);
  });

  it('after the moratorium, recovery uses R × MORATORIUM_R and there is no further drop', () => {
    const p: Params = { ...NO_INC, TAU_MIN: 71, TAU_MAX: 71 };
    const s0 = start(4, p);
    const q1 = one(s0, all(s0, dec(4, 0)), p);
    const q2 = one(q1.s, all(q1.s, dec(2, 10)), p);
    expect(q2.b.moratoriumNow).toBe(false);
    expect(q2.b.moratorium).toBe(0);
    expect(q2.b.from).toBe(q1.b.to);
    expect(q2.b.recovery).toBeCloseTo(p.R * p.MORATORIUM_R * q1.b.to * (1 - q1.b.to / 100), 12);
    expectSums(q2.b);
  });

  it('returns null for a quarter with no record or no previous record', () => {
    const s0 = start(4, PARAMS);
    expect(trustBreakdown(s0.history, 1)).toBeNull();
    const q1 = one(s0, all(s0, dec(2, 10)), PARAMS);
    expect(trustBreakdown(q1.s.history, 2)).toBeNull();
    expect(trustBreakdown(q1.s.history.slice(1), 1)).toBeNull();
  });
});

function randomDecisions(s: EngineState, r: Rng): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  for (const f of s.firms) {
    if (r() < 0.1) continue;
    const others = s.firms.filter((g) => g.id !== f.id);
    out[f.id] = {
      pace: (1 + Math.floor(r() * 4)) as Pace,
      safety: Math.floor(r() * 31),
      card: CARDS[Math.floor(r() * CARDS.length)] ?? 'NONE',
      target: others[Math.floor(r() * others.length)]?.id ?? null,
    };
  }
  return out;
}

describe('trustBreakdown property', () => {
  it('the terms sum to the stored dT in every quarter, over random seeds', () => {
    let quarters = 0;
    let moratoria = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = mulberry32(seed * 7919);
      const n = 2 + Math.floor(r() * 15);
      let s = createGame({ ...SETTINGS, endMode: 'fixed', fixedEnd: 20, minEnd: 20, maxEnd: 20 }, firms(n), seed);
      for (let q = 1; q <= 20; q++) {
        s = resolveRound(s, randomDecisions(s, r)).state;
        const b = trustBreakdown(s.history, q);
        expect(b).not.toBeNull();
        if (!b) continue;
        expect(Math.abs(breakdownSum(b) - b.dT)).toBeLessThan(EPS);
        if (b.moratoriumNow) moratoria++;
        quarters++;
      }
    }
    expect(quarters).toBe(1200);
    // Random play reaches the moratorium in some seeds, so the moratorium term is exercised too.
    expect(moratoria).toBeGreaterThan(0);
  });
});
