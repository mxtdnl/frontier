/**
 * Display model for the projector (`#/screen`). Pure functions over the public nodes only:
 * `public`, `meta`, `firms`, `firmsPublic`, `rounds` and `pacts`. Nothing here, or in any
 * projector component, may read `engine`, which holds τ and the end round.
 */
import { PARAMS, type DisclosureEntry, type Pact } from '../../engine';
import type { FirmNode, FirmPublicNode, MetaNode, PublicNode, RoundNode, WireNode } from '../../firebase/schema';
import { isAlarmKind, mergeWire } from '../../firebase/wire';
import type { TickerTone } from '../../ui/components/Ticker';
import type { RevealInput } from '../../ui/status';

export interface ScreenData {
  pub: PublicNode;
  meta: MetaNode;
  firms: Record<string, FirmNode>;
  firmsPublic: Record<string, FirmPublicNode>;
  rounds: Record<string, RoundNode>;
  pacts: Record<string, Pact>;
  /** Headlines published outside resolution (pact events, disclosure toggle). */
  wire: Record<string, WireNode>;
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

/** Resolved headlines and live events (pact changes, disclosure toggle), newest first. */
export function wireItems(rounds: Record<string, RoundNode>, wire: Record<string, WireNode> = {}): WireItem[] {
  return mergeWire(rounds, wire).map((h) => ({ round: h.round, kind: h.kind, text: h.text }));
}

export interface PactRow {
  id: string;
  name: string;
  maxPace: number | null;
  minSafety: number | null;
  /** Member tickers, with the BREACH flag from the board. */
  members: Array<{ id: string; ticker: string; breach: boolean }>;
  /** The most recent published audit of the pact; null if none has run. */
  lastAudit: { round: number; kind: 'manual' | 'auto'; breaches: number } | null;
}

/** Active pacts for the PACT view. Uses only published audit outcomes, never private violation records. */
export function pactRows(d: ScreenData): PactRow[] {
  const flagged = new Set(boardRows(d).filter((r) => r.breach).map((r) => r.id));
  const rounds = roundNumbers(d.rounds).reverse();
  return Object.values(d.pacts)
    .filter((p) => p.status === 'active')
    .sort((a, b) => a.createdRound - b.createdRound || a.name.localeCompare(b.name))
    .map((p): PactRow => {
      let lastAudit: PactRow['lastAudit'] = null;
      for (const r of rounds) {
        const a = d.rounds[String(r)]?.audits.find((x) => x.pactId === p.id);
        if (a) {
          lastAudit = { round: r, kind: a.kind, breaches: a.breaches.length };
          break;
        }
      }
      return {
        id: p.id,
        name: p.name,
        maxPace: p.terms.maxPace,
        minSafety: p.terms.minSafety,
        members: Object.keys(p.members)
          .map((id) => ({ id, ticker: d.firms[id]?.ticker ?? '', breach: flagged.has(id) }))
          .filter((m) => m.ticker)
          .sort((a, b) => a.ticker.localeCompare(b.ticker)),
        lastAudit,
      };
    });
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

// ── Status line and ticker (spec §14.1, Session 12) ───────────────────────────

/** Tickers of the firms tied at the top valuation in one resolved quarter. */
export function leadersOf(round: RoundNode | undefined, firms: Record<string, FirmNode>): string[] {
  if (!round) return [];
  const entries = Object.entries(round.results).filter(([id]) => firms[id]);
  if (entries.length === 0) return [];
  const top = Math.max(...entries.map(([, r]) => r.valuation));
  return entries
    .filter(([, r]) => r.valuation === top)
    .map(([id]) => (firms[id] as FirmNode).ticker)
    .sort();
}

/** Data for the reveal headline of the latest resolved quarter; null before quarter 1. */
export function revealInput(d: ScreenData): RevealInput | null {
  const last = latestRound(d.rounds);
  const node = d.rounds[String(last)];
  if (!node) return null;
  return {
    round: last,
    T: node.T,
    prevT: previousTrust(d.rounds),
    incidents: node.incidents,
    leaders: leadersOf(node, d.firms),
    prevLeaders: leadersOf(d.rounds[String(last - 1)], d.firms),
    collapseRound: d.pub.collapsed ? d.pub.collapseRound : null,
  };
}

const UP_KINDS: ReadonlySet<string> = new Set(['audit-clean']);

/** Ticker colour by headline kind: alarms in the down colour with ▼, clean audits up, the rest wire. */
export function tickerTone(kind: string): TickerTone {
  if (isAlarmKind(kind)) return 'down';
  if (UP_KINDS.has(kind)) return 'up';
  return 'wire';
}

/** What each board tag means, in board priority order. */
export const TAG_MEANING: ReadonlyArray<readonly [string, string]> = [
  ['BREACH', 'pact terms breached'],
  ['INSOLV', 'forced to lowest pace'],
  ['AUTO', 'default settings applied'],
  ['BOT', 'automated firm'],
];

/**
 * The key strip at the foot of the board (§14.1): only the tags on screen. `shown` holds each
 * visible row's tags as drawn; pact names share one entry, and a `+N` count gets its own.
 */
export function tagKey(shown: ReadonlyArray<ReadonlyArray<string>>, anyMore: boolean): Array<{ tag: string; text: string }> {
  const on = new Set(shown.flat());
  const out = TAG_MEANING.filter(([t]) => on.has(t)).map(([tag, text]) => ({ tag, text }));
  const pacts = [...on].filter((t) => !TAG_MEANING.some(([k]) => k === t)).sort();
  // Pact names are PACT-A, PACT-B…; several share one entry.
  if (pacts.length) out.push({ tag: pacts.length === 1 ? (pacts[0] as string) : 'PACT-', text: pacts.length === 1 ? 'member of this pact' : 'member of the named pact' });
  if (anyMore) out.push({ tag: '+N', text: 'more tags not shown' });
  return out;
}
