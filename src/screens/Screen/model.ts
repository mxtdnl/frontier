/**
 * Display model for the projector (`#/screen`). Pure functions over the public nodes only:
 * `public`, `meta`, `firms`, `firmsPublic`, `rounds` and `pacts`. Nothing here, or in any
 * projector component, may read `engine`, which holds τ and the end round.
 */
import { PARAMS, type DisclosureEntry, type Pact } from '../../engine';
import type { FirmNode, FirmPublicNode, MetaNode, PublicNode, RoundNode } from '../../firebase/schema';

export interface ScreenData {
  pub: PublicNode;
  meta: MetaNode;
  firms: Record<string, FirmNode>;
  firmsPublic: Record<string, FirmPublicNode>;
  rounds: Record<string, RoundNode>;
  pacts: Record<string, Pact>;
  /** Members per firm (facilitator only). */
  memberCounts: Record<string, number>;
}

export interface BoardRow {
  id: string;
  ticker: string;
  name: string;
  /** 1-based. */
  rank: number;
  /** Row index before the last resolution, for the reveal swap. */
  prevIndex: number;
  share: number;
  prevShare: number;
  profit: number;
  prevProfit: number;
  value: number;
  prevValue: number;
  dValue: number;
  committed: boolean;
  auto: boolean;
  insolvent: boolean;
  bot: boolean;
  /** Names of the active pacts the firm belongs to. */
  pacts: string[];
  breach: boolean;
  /** From the last published snapshot; null when disclosure is off or nothing was published. */
  disclosed: DisclosureEntry | null;
}

/** Valuation every firm starts with. */
export const INITIAL_VALUATION = PARAMS.CASH0 + (PARAMS.CAP_MULT * PARAMS.C0 * PARAMS.T0) / PARAMS.TRUST_MAX;

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Round numbers present in `rounds`, ascending. */
export const roundNumbers = (rounds: Record<string, RoundNode>): number[] =>
  Object.keys(rounds)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);

export const latestRound = (rounds: Record<string, RoundNode>): number => roundNumbers(rounds).pop() ?? 0;

/** Firm ids in creation order, the order the engine uses for ties. */
function creationOrder(firms: Record<string, FirmNode>): string[] {
  return Object.entries(firms)
    .sort(([ka, a], [kb, b]) => a.createdAt - b.createdAt || byKey(ka, kb))
    .map(([id]) => id);
}

export function boardRows(d: ScreenData): BoardRow[] {
  const ids = creationOrder(d.firms);
  const n = Math.max(1, ids.length);
  const last = latestRound(d.rounds);
  const prevRound = d.rounds[String(last - 1)];
  const disclosure = d.pub.disclosure ? (d.rounds[String(last)]?.disclosure ?? null) : null;
  const activePacts = Object.values(d.pacts).filter((p) => p.status === 'active');
  const rows = ids.map((id, i): BoardRow => {
    const f = d.firms[id] as FirmNode;
    const fp = d.firmsPublic[id];
    const prev = prevRound?.results[id];
    const prevValue = last <= 1 ? INITIAL_VALUATION : (prev?.valuation ?? INITIAL_VALUATION);
    const value = fp?.valuation ?? INITIAL_VALUATION;
    const rank = fp?.rank ?? i + 1;
    return {
      id,
      ticker: f.ticker,
      name: f.name,
      rank,
      prevIndex: rank - 1 + (fp?.rankDelta ?? 0),
      share: fp?.share ?? 1 / n,
      prevShare: last <= 1 ? 1 / n : (prev?.share ?? 1 / n),
      profit: fp?.profit ?? 0,
      prevProfit: last <= 1 ? 0 : (prev?.profit ?? 0),
      value,
      prevValue,
      dValue: last === 0 ? 0 : value - prevValue,
      committed: !!fp && d.pub.round > 0 && fp.submittedRound === d.pub.round,
      auto: !!fp && fp.auto && d.pub.phase !== 'open',
      insolvent: fp?.insolvent ?? false,
      bot: f.isBot,
      pacts: activePacts.filter((p) => id in p.members).map((p) => p.name).sort(),
      breach: !!fp && fp.breachUntilRound > 0 && d.pub.round <= fp.breachUntilRound,
      disclosed: disclosure?.[id] ?? null,
    };
  });
  return rows.sort((a, b) => a.rank - b.rank);
}

export const committedCount = (rows: ReadonlyArray<BoardRow>): number => rows.filter((r) => r.committed).length;

/** Trust by quarter, starting with the opening value. */
export function trustSeries(rounds: Record<string, RoundNode>): number[] {
  return [PARAMS.T0, ...roundNumbers(rounds).map((r) => (rounds[String(r)] as RoundNode).T)];
}

export function previousTrust(rounds: Record<string, RoundNode>): number {
  const nums = roundNumbers(rounds);
  const before = nums[nums.length - 2];
  return before === undefined ? PARAMS.T0 : (rounds[String(before)] as RoundNode).T;
}

export interface WireItem {
  round: number;
  kind: string;
  text: string;
}

/** Headlines, newest quarter first, in the order the engine produced them. */
export function wireItems(rounds: Record<string, RoundNode>): WireItem[] {
  const out: WireItem[] = [];
  for (const r of roundNumbers(rounds).reverse()) {
    for (const h of (rounds[String(r)] as RoundNode).headlines) out.push({ round: r, kind: h.kind, text: h.text });
  }
  return out;
}

/** Valuation by quarter for one firm, starting with the opening value. */
export function valuationSeries(id: string, rounds: Record<string, RoundNode>): number[] {
  return [INITIAL_VALUATION, ...roundNumbers(rounds).map((r) => rounds[String(r)]?.results[id]?.valuation ?? INITIAL_VALUATION)];
}

/** Largest market the firm count could support, the full-scale value for the market bar. */
export const marketCeiling = (firmCount: number): number => PARAMS.M_PER_FIRM * Math.max(1, firmCount);

/** URL participants open to join, from the page's own address. */
export function joinUrl(code: string, href: string): string {
  const u = new URL(href);
  u.search = '';
  u.hash = `#/j/${code}`;
  return u.toString();
}
