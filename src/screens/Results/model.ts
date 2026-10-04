/** Pure helpers for the results panels (spec §14.4). */
import type { FinalResults, FirmFinal, PactFinal } from '../../engine';
import { ATTRIBUTION_ALL_MAX, ATTRIBUTION_TOP, tickerLine } from '../../ui/layout';

export const RESULT_PANELS = ['FINAL BOARD', 'TRUST TRACE', 'COUNTERFACTUAL', 'ATTRIBUTION', 'PACT RECORD', 'DEBRIEF'] as const;

/** Spec §15.5. */
export const DEBRIEF_PROMPTS: ReadonlyArray<string> = [
  'When did your firm first notice trust falling, and what did you change?',
  'Which pacts held and which broke? Was the difference monitoring, sanctions or trust?',
  'Compare your share of the damage with your share of the value. Is that outcome fair, and who should pay?',
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
