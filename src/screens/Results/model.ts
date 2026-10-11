/** Pure helpers for the results panels (spec §14.4). */
import { PACT_QUARTER, type ConductLedger, type FinalResults, type FirmContribution, type FirmFinal, type PactFinal, type PactQuarterCode } from '../../engine';
import { ATTRIBUTION_ALL_MAX, ATTRIBUTION_TOP, tickerLine } from '../../ui/layout';

export const RESULT_PANELS = ['FINAL BOARD', 'TRUST TRACE', 'COUNTERFACTUAL', 'ATTRIBUTION', 'NET CONTRIBUTION', 'PACT RECORD', 'DEBRIEF'] as const;

/** Spec §15.5. Prompt 3 refers to the NET CONTRIBUTION panel (owner wording, 2026-10-10, Session 18). */
export const DEBRIEF_PROMPTS: ReadonlyArray<string> = [
  'When did your firm first notice trust falling, and what did you change?',
  'Which pacts held and which broke? Was the difference monitoring, sanctions or trust?',
  'Compare your share of the damage with your share of the value. Ranked by net contribution, where does your firm fall? Is that outcome fair, and who should pay?',
  'Would disclosure from quarter 1 have changed your decisions? Why?',
  'Where does this pattern appear in the real AI industry, and which of Ostrom’s design principles would you add to the market?',
];

/** Firms by final rank (the engine's rank at the last resolved quarter), then ticker. */
export function rankedFirms(r: FinalResults): FirmFinal[] {
  return Object.values(r.final).sort((a, b) => a.rank - b.rank || (a.ticker < b.ticker ? -1 : 1));
}

/** Trust by quarter with the opening value first: index n is the value after quarter n. */
export function trustSeries(r: FinalResults): number[] {
  return [r.startTrust, ...r.trust];
}

export function counterfactualTrustSeries(r: FinalResults): number[] {
  return [r.startTrust, ...r.counterfactual.trust];
}

export interface ChangeFigure {
  /** VALUE LOST when the alternative total is at least the actual total, VALUE ADDED otherwise (§10). */
  label: 'VALUE LOST' | 'VALUE ADDED';
  /** Size of the difference, never negative. */
  amount: number;
  glyph: '▼' | '▲' | '';
  /** Percentage of the alternative, only when the actual industry total is positive; otherwise the reason. */
  sub: string;
}

export interface HeadlineFigures {
  actual: number;
  alternative: number;
  change: ChangeFigure;
}

/**
 * The three counterfactual figures (spec §10, owner decision 5). The engine's `destroyed` = alternative − actual is
 * unchanged; only its presentation depends on the signs.
 */
export function headlineFigures(r: FinalResults): HeadlineFigures {
  const { actual, counterfactual: alternative, destroyed } = r.industry;
  const added = destroyed < 0;
  const amount = Math.abs(destroyed);
  let sub: string;
  if (actual <= 0) sub = 'industry finished below zero';
  else if (alternative > 0) sub = `${Math.round((amount / alternative) * 100)}% ${added ? 'above' : 'of'} the alternative`;
  else sub = '';
  return {
    actual,
    alternative,
    change: { label: added ? 'VALUE ADDED' : 'VALUE LOST', amount, glyph: amount === 0 ? '' : added ? '▲' : '▼', sub },
  };
}

export interface DumbbellRow {
  firmId: string;
  rank: number;
  ticker: string;
  final: number;
  peak: number;
  /** final − peak; 0 or negative. */
  fromPeak: number;
}

/** Final board rows, by rank: peak and final valuation for the dumbbell (panel 1). */
export function finalBoardRows(r: FinalResults): DumbbellRow[] {
  return rankedFirms(r).map((f) => ({
    firmId: f.firmId,
    rank: f.rank,
    ticker: f.ticker,
    final: f.valuation,
    peak: f.peakValuation,
    fromPeak: Math.min(0, f.valuation - f.peakValuation),
  }));
}

export interface ButterflyRow {
  firmId: string;
  ticker: string;
  /** Share of cumulative draw, 0–1. */
  damage: number;
  /** Share of final value with negatives counted as 0, 0–1. */
  value: number;
}

/** Attribution rows in the engine's order (highest share of damage first), and whether any firm kept positive value. */
export function attributionRows(r: FinalResults): { rows: ButterflyRow[]; anyPositive: boolean } {
  return {
    rows: r.attribution.map((a) => ({ firmId: a.firmId, ticker: tickerOf(r, a.firmId), damage: a.drawShare, value: a.valueShare })),
    anyPositive: Object.values(r.final).some((f) => f.valuation > 0),
  };
}

/** OTHERS row id in a shortened attribution chart. */
export const OTHERS_ID = '__others';

/**
 * Attribution as drawn (§14.4): every firm up to 24; above, the 12 largest shares of damage
 * and one OTHERS row with the combined shares of the rest (`others` firms).
 */
export function attributionView(r: FinalResults): { rows: ButterflyRow[]; anyPositive: boolean; others: ButterflyRow | null; combined: number } {
  const all = attributionRows(r);
  if (all.rows.length <= ATTRIBUTION_ALL_MAX) return { ...all, others: null, combined: 0 };
  const rest = all.rows.slice(ATTRIBUTION_TOP);
  return {
    rows: all.rows.slice(0, ATTRIBUTION_TOP),
    anyPositive: all.anyPositive,
    others: {
      firmId: OTHERS_ID,
      ticker: 'OTHERS',
      damage: rest.reduce((a, x) => a + x.damage, 0),
      value: rest.reduce((a, x) => a + x.value, 0),
    },
    combined: rest.length,
  };
}

export function tickerOf(r: FinalResults, firmId: string): string {
  return r.final[firmId]?.ticker ?? '?';
}

export interface PactLine {
  pact: PactFinal;
  members: string;
  /** "TICKER n" for each firm with undetected violations. */
  undetectedBy: string[];
}

export function pactLines(r: FinalResults): PactLine[] {
  return r.pacts.map((pact) => ({
    pact,
    members: tickerLine(pact.members.map((id) => tickerOf(r, id))) || '–',
    undetectedBy: Object.entries(pact.perFirm)
      .filter(([, v]) => v.undetected > 0)
      .map(([id, v]) => `${tickerOf(r, id)} ${v.undetected}`),
  }));
}

export interface PactStripRow {
  firmId: string;
  ticker: string;
  /** Bound by the terms at some point but not a member at the end (left, expelled, or the pact dissolved without it). */
  former: boolean;
  /** One code per resolved quarter, quarter 1 first. */
  cells: PactQuarterCode[];
}

const QUARTER_CODES: ReadonlySet<string> = new Set(Object.values(PACT_QUARTER));

/**
 * Quarter strip rows for one pact (§14.4 PACT RECORD): members at the end in their table order, then
 * former members by ticker. A firm with no quarter bound by the terms has no row.
 */
export function pactStripRows(r: FinalResults, pact: PactFinal): PactStripRow[] {
  const cellsOf = (id: string): PactQuarterCode[] => {
    const line = pact.quarters[id] ?? '';
    return Array.from({ length: r.rounds }, (_, i) => {
      const c = line[i] ?? PACT_QUARTER.none;
      return (QUARTER_CODES.has(c) ? c : PACT_QUARTER.none) as PactQuarterCode;
    });
  };
  const bound = (cells: PactQuarterCode[]) => cells.some((c) => c !== PACT_QUARTER.none);
  const current = pact.members.map((id) => ({ firmId: id, ticker: tickerOf(r, id), former: false, cells: cellsOf(id) }));
  const members = new Set(pact.members);
  const former = Object.keys(pact.quarters)
    .filter((id) => !members.has(id))
    .map((id) => ({ firmId: id, ticker: tickerOf(r, id), former: true, cells: cellsOf(id) }))
    .sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  return [...current, ...former].filter((row) => bound(row.cells));
}

// ── NET CONTRIBUTION (§14.4 panel 5, Session 18) ─────────────────────────────

/** A rank change of this many places or more is highlighted on the slope chart. */
export const SLOPE_HIGHLIGHT = 3;

export interface ContributionRow {
  firmId: string;
  ticker: string;
  valuationRank: number;
  /** Rank by net contribution. */
  rank: number;
  /** Places gained against the valuation rank: positive rose, negative fell. */
  move: number;
  highlight: 'up' | 'down' | null;
  valuation: number;
  market: number;
  credit: number;
  /** Rivalry taken, as a positive amount; shown with a − sign. */
  rivalry: number;
  net: number;
  ledger: string;
}

const LEDGER_FOR: ReadonlyArray<readonly [keyof ConductLedger, string]> = [
  ['publish', 'PUBLISH'],
  ['share', 'SHARE'],
  ['restraint', 'restraint'],
  ['compliant', 'pact kept'],
];
const LEDGER_AGAINST: ReadonlyArray<readonly [keyof ConductLedger, string]> = [
  ['poach', 'POACH'],
  ['blitz', 'BLITZ'],
  ['lobby', 'LOBBY'],
  ['rush', 'RUSH'],
  ['breaches', 'breaches'],
  ['incidents', 'incidents'],
];

/** "▲ PUBLISH 6 · restraint 9  ▼ POACH 2 · BLITZ 3 · breaches 1": counts for the market, then against it. */
export function ledgerLine(l: ConductLedger): string {
  const side = (items: ReadonlyArray<readonly [keyof ConductLedger, string]>): string =>
    items
      .filter(([k]) => l[k] > 0)
      .map(([k, label]) => `${label} ${l[k]}`)
      .join(' · ') || 'none';
  return `▲ ${side(LEDGER_FOR)}  ▼ ${side(LEDGER_AGAINST)}`;
}

function contributionRow(c: FirmContribution): ContributionRow {
  const move = c.valuationRank - c.rank;
  return {
    firmId: c.firmId,
    ticker: c.ticker,
    valuationRank: c.valuationRank,
    rank: c.rank,
    move,
    highlight: move >= SLOPE_HIGHLIGHT ? 'up' : move <= -SLOPE_HIGHLIGHT ? 'down' : null,
    valuation: c.valuation,
    market: c.marketEffect,
    credit: c.researchCredit,
    rivalry: c.rivalryTaken,
    net: c.netContribution,
    ledger: ledgerLine(c.ledger),
  };
}

/** Every firm by rank of net contribution. Empty for results written before Session 18. */
export function contributionRows(r: FinalResults): ContributionRow[] {
  return Object.values(r.contribution?.firms ?? {})
    .map(contributionRow)
    .sort((a, b) => a.rank - b.rank || (a.ticker < b.ticker ? -1 : 1));
}

/**
 * The figures list as drawn (§14.4, following ATTRIBUTION's many-firms rule): every firm up to 24; above, the 12 firms
 * whose rank changed most (then by rank of net contribution), in rank order, and one OTHERS row summing the rest.
 */
export function contributionView(r: FinalResults): { rows: ContributionRow[]; others: ContributionRow | null; combined: number } {
  const all = contributionRows(r);
  if (all.length <= ATTRIBUTION_ALL_MAX) return { rows: all, others: null, combined: 0 };
  const keep = new Set(
    [...all]
      .sort((a, b) => Math.abs(b.move) - Math.abs(a.move) || a.rank - b.rank)
      .slice(0, ATTRIBUTION_TOP)
      .map((x) => x.firmId),
  );
  const rest = all.filter((x) => !keep.has(x.firmId));
  const sum = (k: 'valuation' | 'market' | 'credit' | 'rivalry' | 'net'): number => rest.reduce((a, x) => a + x[k], 0);
  return {
    rows: all.filter((x) => keep.has(x.firmId)),
    others: {
      firmId: OTHERS_ID,
      ticker: 'OTHERS',
      valuationRank: 0,
      rank: 0,
      move: 0,
      highlight: null,
      valuation: sum('valuation'),
      market: sum('market'),
      credit: sum('credit'),
      rivalry: sum('rivalry'),
      net: sum('net'),
      ledger: '',
    },
    combined: rest.length,
  };
}

/** The running totals a firm's row passes through: 0, valuation, + market effect, + research credit, − rivalry (= net). */
export const waterfallPoints = (x: Pick<ContributionRow, 'valuation' | 'market' | 'credit' | 'rivalry'>): [number, number, number, number, number] => {
  const a = x.valuation;
  const b = a + x.market;
  const c = b + x.credit;
  return [0, a, b, c, c - x.rivalry];
};
