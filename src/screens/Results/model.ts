/** Pure helpers for the results panels (spec §14.4). */
import type { FinalResults, FirmFinal, PactFinal } from '../../engine';

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

/** Bar length 0–1 against `max`; negative values draw no bar (the figure carries the sign). */
export function barFraction(value: number, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
}

/** Trust by quarter with the opening value first: index n is the value after quarter n. */
export function trustSeries(r: FinalResults): number[] {
  return [r.startTrust, ...r.trust];
}

export function counterfactualTrustSeries(r: FinalResults): number[] {
  return [r.startTrust, ...r.counterfactual.trust];
}

/** Value destroyed as a share of the sustainable total; null when that total is not positive. */
export function destroyedShare(r: FinalResults): number | null {
  return r.industry.counterfactual > 0 ? r.industry.destroyed / r.industry.counterfactual : null;
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
    members: pact.members.map((id) => tickerOf(r, id)).join(' ') || '–',
    undetectedBy: Object.entries(pact.perFirm)
      .filter(([, v]) => v.undetected > 0)
      .map(([id, v]) => `${tickerOf(r, id)} ${v.undetected}`),
  }));
}
