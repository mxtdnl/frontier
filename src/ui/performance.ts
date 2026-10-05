/**
 * Firm performance views (spec §14.1 board, `FIRMS`, `RANKS`; §14.3 BOOK; Session 13). Pure functions over public data
 * only: each quarter's `rounds/{r}/results` (valuation and rank per firm) and the firms' tickers. No DOM, no React.
 */
import type { RoundNode } from '../firebase/schema';
import { quarterLabel } from './format';

export interface FirmRef {
  id: string;
  ticker: string;
}

/** The board's trend line covers the last 14 quarters. */
export const TREND_QUARTERS = 14;

const byTicker = (a: FirmRef, b: FirmRef): number => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0);

/** Resolved quarter numbers, ascending. */
export function resolvedRounds(rounds: Record<string, RoundNode>): number[] {
  return Object.keys(rounds)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

// ── Ranks (RANKS view, board MOVE, phone sentence) ────────────────────────────

export interface RankTable {
  /** Resolved quarters, ascending. */
  rounds: number[];
  /** Firm id → rank in each of `rounds` (1 is the top). */
  ranks: Record<string, number[]>;
}

/**
 * Rank by quarter. Each quarter orders the firms by valuation, then by the engine's stored rank (its own tie-break),
 * then by ticker, so the result matches the board and is deterministic even where the data ties. A firm with no
 * result for a quarter ranks last.
 */
export function rankByQuarter(firms: ReadonlyArray<FirmRef>, rounds: Record<string, RoundNode>): RankTable {
  const nums = resolvedRounds(rounds);
  const ranks: Record<string, number[]> = Object.fromEntries(firms.map((f) => [f.id, [] as number[]]));
  for (const r of nums) {
    const results = rounds[String(r)]?.results ?? {};
    const order = [...firms].sort((a, b) => {
      const ra = results[a.id];
      const rb = results[b.id];
      const va = ra?.valuation ?? -Infinity;
      const vb = rb?.valuation ?? -Infinity;
      if (va !== vb) return vb - va;
      const ka = ra?.rank ?? Infinity;
      const kb = rb?.rank ?? Infinity;
      if (ka !== kb) return ka < kb ? -1 : 1;
      return byTicker(a, b);
    });
    order.forEach((f, i) => (ranks[f.id] as number[]).push(i + 1));
  }
  return { rounds: nums, ranks };
}

/** Places gained (positive) or lost (negative) at the latest quarter; 0 with fewer than two quarters. */
export function rankMove(series: ReadonlyArray<number>): number {
  if (series.length < 2) return 0;
  return (series[series.length - 2] as number) - (series[series.length - 1] as number);
}

/** Firm at rank 1 in the latest quarter, or null before quarter 1. */
export function leaderOf(firms: ReadonlyArray<FirmRef>, table: RankTable): FirmRef | null {
  return firms.find((f) => table.ranks[f.id]?.[table.rounds.length - 1] === 1) ?? null;
}

export interface Faller {
  firm: FirmRef;
  /** Best (lowest) rank the firm has held. */
  best: number;
  /** Rank now. */
  now: number;
}

/** The firm with the largest fall from its best rank (ties: the ticker first). Null when no firm is below its best. */
export function largestFaller(firms: ReadonlyArray<FirmRef>, table: RankTable): Faller | null {
  let out: Faller | null = null;
  for (const f of [...firms].sort(byTicker)) {
    const s = table.ranks[f.id] ?? [];
    if (s.length === 0) continue;
    const best = Math.min(...s);
    const now = s[s.length - 1] as number;
    if (now - best <= 0) continue;
    if (!out || now - best > out.now - out.best) out = { firm: f, best, now };
  }
  return out;
}

/** Rank labels: every rank up to 16 firms, then 1 and every 5th. */
export function rankAxis(n: number): number[] {
  if (n <= 16) return Array.from({ length: n }, (_, i) => i + 1);
  const out = [1];
  for (let r = 5; r <= n; r += 5) out.push(r);
  return out;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** The RANKS headline: "HUMN rose to 1st. BTC fell from 1st to 2nd." Empty before quarter 1. */
export function ranksHeadline(firms: ReadonlyArray<FirmRef>, table: RankTable): string {
  const n = table.rounds.length;
  const leader = leaderOf(firms, table);
  if (n === 0 || !leader) return '';
  const lr = table.ranks[leader.id] ?? [];
  const first =
    n === 1
      ? `${leader.ticker} is 1st after ${quarterLabel(table.rounds[0] as number)}.`
      : lr[n - 2] === 1
        ? `${leader.ticker} holds 1st.`
        : `${leader.ticker} rose to 1st.`;
  const f = largestFaller(firms, table);
  const second = f ? `${f.firm.ticker} fell from ${ordinal(f.best)} to ${ordinal(f.now)}.` : 'No firm is below its best rank.';
  return `${first} ${second}`;
}

/** The BOOK sentence: "Rank 1 of 9. Highest valuation for 13 quarters running." Empty before quarter 1. */
export function bookSentence(own: ReadonlyArray<number>, firmCount: number): string {
  const r = own[own.length - 1];
  if (r === undefined) return '';
  const head = `Rank ${r} of ${firmCount}.`;
  if (r === 1) {
    let k = 0;
    for (let i = own.length - 1; i >= 0 && own[i] === 1; i--) k++;
    return k >= 2 ? `${head} Highest valuation for ${k} quarters running.` : `${head} Highest valuation this quarter.`;
  }
  if (own.length < 2) return head;
  const m = rankMove(own);
  if (m === 0) return `${head} Same place as last quarter.`;
  const places = `${Math.abs(m)} place${Math.abs(m) === 1 ? '' : 's'}`;
  return `${head} ${m > 0 ? 'Up' : 'Down'} ${places} since last quarter.`;
}

// ── Valuations (board bar and trend, FIRMS cards, BOOK) ───────────────────────

/** Valuation by quarter, starting with `opening`; a quarter with no result repeats the previous value. */
export function valuationHistory(id: string, rounds: Record<string, RoundNode>, opening: number): number[] {
  const out = [opening];
  for (const r of resolvedRounds(rounds)) out.push(rounds[String(r)]?.results[id]?.valuation ?? (out[out.length - 1] as number));
  return out;
}

/** The last `n` points of a series (the board trend line). */
export const trendWindow = (values: ReadonlyArray<number>, n = TREND_QUARTERS): number[] => values.slice(-n);

/** One domain for every row or card: always includes 0, never zero-width. */
export function sharedDomain(series: ReadonlyArray<ReadonlyArray<number>>): readonly [number, number] {
  const all = series.flat().filter((v) => Number.isFinite(v));
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  return lo === hi ? [lo, lo + 1] : [lo, hi];
}

/** A value bar from zero as fractions of the track: where zero sits, and the filled span. */
export function barSpan(value: number, domain: readonly [number, number]): { zero: number; start: number; width: number } {
  const [lo, hi] = domain;
  const f = (v: number) => (hi === lo ? 0 : (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo));
  const zero = f(0);
  const end = f(value);
  return { zero, start: Math.min(zero, end), width: Math.abs(end - zero) };
}

// ── Value share strip (board) ─────────────────────────────────────────────────

export interface ShareSegment {
  id: string;
  ticker: string;
  /** Share of the positive total, 0–1. */
  share: number;
  /** Fade step by rank, 0 (brightest) to 4. */
  level: number;
}

export const SHARE_LEVELS = 5;

/**
 * Market value share: firms above zero only, in value order (ties by ticker), each as its share of the positive
 * total. Firms below zero are counted, not drawn.
 */
export function shareSegments(rows: ReadonlyArray<FirmRef & { value: number }>): { segments: ShareSegment[]; below: number } {
  const pos = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value || byTicker(a, b));
  const total = pos.reduce((s, r) => s + r.value, 0);
  const segments = pos.map((r, i) => ({
    id: r.id,
    ticker: r.ticker,
    share: r.value / total,
    level: Math.min(SHARE_LEVELS - 1, Math.floor((i * SHARE_LEVELS) / pos.length)),
  }));
  return { segments, below: rows.filter((r) => r.value < 0).length };
}

/** "HUMN 30%" when the segment (`stripCh` wide in total) holds it with a character to spare; otherwise null. */
export function segmentLabel(seg: Pick<ShareSegment, 'ticker' | 'share'>, stripCh: number): string | null {
  const text = `${seg.ticker} ${Math.round(seg.share * 100)}%`;
  return seg.share * stripCh >= text.length + 1 ? text : null;
}

// ── BOOK: against the field ───────────────────────────────────────────────────

export interface Field {
  /** Quarter the first value closes. */
  start: number;
  own: number[];
  /** Every other firm with a result in every quarter. */
  others: number[][];
}

/** Valuation per resolved quarter for the own firm and every other firm, from `rounds` only (public data). */
export function fieldSeries(firmIds: ReadonlyArray<string>, ownId: string, rounds: Record<string, RoundNode>): Field {
  const nums = resolvedRounds(rounds);
  if (nums.length === 0) return { start: 1, own: [], others: [] };
  const series = (id: string): number[] | null => {
    const out: number[] = [];
    for (const r of nums) {
      const v = rounds[String(r)]?.results[id]?.valuation;
      if (v === undefined) return null;
      out.push(v);
    }
    return out;
  };
  return {
    start: nums[0] ?? 1,
    own: series(ownId) ?? [],
    others: firmIds
      .filter((id) => id !== ownId)
      .map(series)
      .filter((s): s is number[] => s !== null),
  };
}
