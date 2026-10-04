/**
 * Calibration scenarios (spec §8.1) and diagnostics (§8.2). Uses the engine exactly as
 * the game does; nothing here changes a mechanic.
 */
import {
  allowedCards,
  createGame,
  resolveRound,
  type Card,
  type Decision,
  type EngineState,
  type FirmInit,
  type Pace,
  type Params,
  type Policy,
  type RoundOutputs,
} from '../../src/engine';

export const NS = [4, 6, 8, 10, 12, 16, 20, 30, 40, 50] as const;
export const ROUNDS = 14;
export const LONG_ROUNDS = 30;

export interface RunResult {
  collapseRound: number | null;
  /** Trust after each round. */
  trust: number[];
  /** Valuation by firm order after each round (index 0 = round 1). */
  values: number[][];
  outputs: RoundOutputs[];
  dataLines: string[];
}

type FirmSetup = { kind: 'bot'; policy: Policy } | { kind: 'fixed'; d: Decision } | { kind: 'defaults' };

export function simulate(
  p: Params,
  seed: number,
  setups: ReadonlyArray<FirmSetup>,
  rounds: number,
  opts: { disclosure?: boolean; keepData?: boolean; label?: string } = {},
): RunResult {
  const firms: FirmInit[] = setups.map((s, i) => ({
    id: `f${i}`,
    ticker: `F${String(i).padStart(2, '0')}`,
    isBot: s.kind === 'bot',
    botPolicy: s.kind === 'bot' ? s.policy : null,
  }));
  let state = createGame(
    { label: opts.label ?? 'CAL', endMode: 'manual', minEnd: p.END_MIN, maxEnd: p.END_MAX, fixedEnd: null, disclosure: opts.disclosure ?? false, autoAuditP: 0 },
    firms,
    seed,
    p,
  );
  const decisions: Record<string, Decision> = {};
  setups.forEach((s, i) => {
    if (s.kind === 'fixed') decisions[`f${i}`] = s.d;
  });
  const out: RunResult = { collapseRound: null, trust: [], values: [], outputs: [], dataLines: [] };
  for (let r = 0; r < rounds; r++) {
    const res = resolveRound(state, decisions, p);
    state = trim(res.state);
    out.trust.push(state.T);
    out.values.push(state.firms.map((f) => f.valuation));
    out.outputs.push(res.outputs);
    if (opts.keepData) out.dataLines.push(...res.dataLines);
  }
  out.collapseRound = state.collapseRound;
  return out;
}

/** Keeps only the last history record (all the engine reads), so long runs stay fast. */
function trim(s: EngineState): EngineState {
  if (s.history.length > 1) s.history = s.history.slice(-1);
  return s;
}

const bot = (policy: Policy): FirmSetup => ({ kind: 'bot', policy });
export const GREEDY = bot('greedy');
export const SUSTAINABLE = bot('sustainable');
export const fixed = (pace: Pace, safety: number): FirmSetup => ({ kind: 'fixed', d: { pace, safety, card: 'NONE', target: null } });
export const DEFAULTS: FirmSetup = { kind: 'defaults' };

export const allOf = (n: number, s: FirmSetup): FirmSetup[] => Array.from({ length: n }, () => s);
export const oneGreedy = (n: number): FirmSetup[] => [GREEDY, ...allOf(n - 1, SUSTAINABLE)];
export const halfGreedy = (n: number): FirmSetup[] => Array.from({ length: n }, (_, i) => (i < Math.floor(n / 2) ? GREEDY : SUSTAINABLE));
export const mixedField = (n: number): FirmSetup[] =>
  Array.from({ length: n }, (_, i) => bot((['cautious', 'standard', 'greedy', 'mimic-leader'] as const)[i % 4] ?? 'standard'));

// ── statistics ──

export function quantile(xs: ReadonlyArray<number>, q: number): number {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const x = a[lo] ?? NaN;
  const y = a[hi] ?? NaN;
  // Runs without a moratorium are Infinity; interpolating towards them is undefined.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return pos - lo < 0.5 ? x : y;
  return x + (y - x) * (pos - lo);
}
export const median = (xs: ReadonlyArray<number>): number => quantile(xs, 0.5);
export const mean = (xs: ReadonlyArray<number>): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
/** (x − base) / |base|: the relative gain of x over base, defined for negative bases. */
export const gain = (x: number, base: number): number => (x - base) / Math.abs(base);

// ── §8.1 conditions ──

export interface Condition {
  id: 'C1' | 'C2' | 'C3' | 'C4';
  n: number;
  pass: boolean;
  detail: Record<string, number>;
}

export interface NResult {
  n: number;
  conditions: Condition[];
  c1Rounds: number[];
  c1Values: number[];
  c2Values: number[];
  c2Gains: number[];
  c3Gains: number[];
  c3Greedy: number[];
  c3Sustainable: number[];
  c4Rounds: number[];
  sampleData: string[];
}

const NEVER = Infinity;

/** DATA lines are kept for seed 1 at N=8, or for every run with `keepAll`. */
export function runConditions(p: Params, n: number, seeds: number, keepAll = false): NResult {
  const c1Rounds: number[] = [];
  const c1Values: number[] = [];
  const c2Values: number[] = [];
  const c2Gains: number[] = [];
  let c2Collapses = 0;
  const c3Gains: number[] = [];
  const c3Greedy: number[] = [];
  const c3Sustainable: number[] = [];
  const c4Rounds: number[] = [];
  const sampleData: string[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const keepData = keepAll || (seed === 1 && n === 8);
    const c1 = simulate(p, seed, allOf(n, GREEDY), ROUNDS, { keepData, label: 'C1' });
    c1Rounds.push(c1.collapseRound ?? NEVER);
    const v1 = mean(c1.values[ROUNDS - 1] ?? []);
    c1Values.push(v1);

    const c2 = simulate(p, seed, allOf(n, SUSTAINABLE), LONG_ROUNDS, { keepData, label: 'C2' });
    if (c2.collapseRound !== null) c2Collapses++;
    const v2 = mean(c2.values[ROUNDS - 1] ?? []);
    c2Values.push(v2);
    c2Gains.push(gain(v2, v1));

    const c3 = simulate(p, seed, oneGreedy(n), ROUNDS, { keepData, label: 'C3' });
    const last = c3.values[ROUNDS - 1] ?? [];
    const g = last[0] ?? NaN;
    const s = mean(last.slice(1));
    c3Greedy.push(g);
    c3Sustainable.push(s);
    c3Gains.push(gain(g, s));
    c4Rounds.push(c3.collapseRound ?? NEVER);
    if (keepData) sampleData.push(...c1.dataLines, ...c2.dataLines, ...c3.dataLines);
  }
  const frac = (xs: number[], pred: (x: number) => boolean): number => xs.filter(pred).length / xs.length;
  const c1Median = median(c1Rounds);
  const c1By12 = frac(c1Rounds, (r) => r <= 12);
  const c2Rate = c2Collapses / seeds;
  const c2MedianGain = median(c2Gains);
  const c3MedianGain = median(c3Gains);
  const c4Rate = frac(c4Rounds, (r) => r <= ROUNDS);
  return {
    n,
    conditions: [
      {
        id: 'C1',
        n,
        pass: c1Median >= 5 && c1Median <= 9 && c1By12 >= 0.9,
        detail: { medianRound: c1Median, collapsedBy12: c1By12, collapsedBy14: frac(c1Rounds, (r) => r <= ROUNDS) },
      },
      {
        id: 'C2',
        n,
        pass: c2Rate <= 0.01 && c2MedianGain >= 0.4,
        detail: { collapseRateBy30: c2Rate, medianValueGainVsC1: c2MedianGain, gainOfMeans: gain(mean(c2Values), mean(c1Values)) },
      },
      {
        id: 'C3',
        n,
        pass: c3MedianGain >= 0.25,
        detail: { medianGreedyGain: c3MedianGain, gainOfMeans: gain(mean(c3Greedy), mean(c3Sustainable)) },
      },
      { id: 'C4', n, pass: c4Rate <= 0.05, detail: { collapseRateBy14: c4Rate } },
    ],
    c1Rounds,
    c1Values,
    c2Values,
    c2Gains,
    c3Gains,
    c3Greedy,
    c3Sustainable,
    c4Rounds,
    sampleData,
  };
}

// ── §8.2 diagnostics ──

export interface CollapseDist {
  rounds: number[];
  rateBy14: number;
  rateBy30: number;
}

export function collapseDist(p: Params, seeds: number, setups: (n: number) => ReturnType<typeof allOf>, n: number): CollapseDist {
  const rounds: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) rounds.push(simulate(p, seed, setups(n), LONG_ROUNDS).collapseRound ?? NEVER);
  return {
    rounds,
    rateBy14: rounds.filter((r) => r <= ROUNDS).length / seeds,
    rateBy30: rounds.filter((r) => r <= LONG_ROUNDS).length / seeds,
  };
}

export interface PassivePath {
  collapseRateBy30: number;
  /** Per round: [p10, p50, p90] of trust across seeds. */
  trust: Array<[number, number, number]>;
  sample: number[];
}

export function passivePath(p: Params, seeds: number, n: number): PassivePath {
  const traces: number[][] = [];
  let collapses = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = simulate(p, seed, allOf(n, DEFAULTS), LONG_ROUNDS);
    traces.push(r.trust);
    if (r.collapseRound !== null) collapses++;
  }
  const trust: Array<[number, number, number]> = [];
  for (let i = 0; i < LONG_ROUNDS; i++) {
    const col = traces.map((t) => t[i] ?? NaN);
    trust.push([quantile(col, 0.1), quantile(col, 0.5), quantile(col, 0.9)]);
  }
  return { collapseRateBy30: collapses / seeds, trust, sample: traces[0] ?? [] };
}

/**
 * Card dominance (§8.2). One focal firm (f0) plays greedy pace and safety against a
 * greedy field. Each quarter it picks the legal card that maximises its own valuation
 * at the end of that quarter (a myopic best response, evaluated with the same draws).
 * POACH targets the most valuable other firm that was not its previous target.
 */
export function cardDominance(p: Params, seeds: number, n: number): Record<Card, number> {
  const counts: Record<Card, number> = { NONE: 0, POACH: 0, PUBLISH: 0, LOBBY: 0, BLITZ: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    const firms: FirmInit[] = Array.from({ length: n }, (_, i) => ({
      id: `f${i}`,
      ticker: `F${i}`,
      isBot: i > 0,
      botPolicy: i > 0 ? 'greedy' : null,
    }));
    let s = createGame({ label: 'CARD', endMode: 'manual', minEnd: p.END_MIN, maxEnd: p.END_MAX, fixedEnd: null, disclosure: false, autoAuditP: 0 }, firms, seed, p);
    for (let r = 0; r < ROUNDS; r++) {
      const focal = s.firms[0];
      if (!focal) break;
      const pace: Pace = r % 2 === 0 ? 4 : 3;
      const target =
        [...s.firms]
          .filter((f) => f.id !== focal.id && f.id !== focal.lastPoachTarget)
          .sort((a, b) => b.valuation - a.valuation)[0]?.id ?? null;
      let best: { card: Card; v: number; state: EngineState } | null = null;
      for (const card of allowedCards(focal)) {
        const res = resolveRound(s, { f0: { pace, safety: p.BOT_GREEDY_SAFETY, card, target: card === 'POACH' ? target : null } }, p);
        const v = res.state.firms[0]?.valuation ?? -Infinity;
        if (!best || v > best.v) best = { card, v, state: res.state };
      }
      if (!best) break;
      counts[best.card]++;
      s = trim(best.state);
    }
  }
  return counts;
}

/** Leaderboard volatility (§8.2): mixed field with disclosure on, rounds 2–14. */
export function volatility(p: Params, seeds: number, n: number): { meanChanged: number; meanAbsDelta: number } {
  let changed = 0;
  let absDelta = 0;
  let rounds = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = simulate(p, seed, mixedField(n), ROUNDS, { disclosure: true });
    for (const o of r.outputs.slice(1)) {
      const ds = Object.values(o.firms).map((f) => f.rankDelta);
      changed += ds.filter((d) => d !== 0).length;
      absDelta += ds.reduce((a, d) => a + Math.abs(d), 0) / n;
      rounds++;
    }
  }
  return { meanChanged: changed / rounds, meanAbsDelta: absDelta / rounds };
}
