/**
 * Final results (spec §10, §14.4): the board, trust trace, counterfactual, attribution, pact
 * record and DATA lines for a finished session. Pure: the facilitator client calls this once
 * the phase is `ended` and writes the output to `/results` in one update.
 */
import { attribution, compareIndustry, runCounterfactual, type AttributionRow, type CounterfactualResult } from './counterfactual';
import { dataLine } from './data';
import { PARAMS, type Params } from './params';
import type { EngineState, PactPrivate, PactTerms } from './types';

export interface FirmFinal {
  firmId: string;
  ticker: string;
  isBot: boolean;
  rank: number;
  valuation: number;
  peakValuation: number;
  /** Final valuation on the sustainable path (mean per firm; see runCounterfactual). */
  counterfactual: number;
  /** Share of cumulative draw, 0–1. */
  drawShare: number;
  /** Share of final industry valuation, 0–1, negatives counted as 0. */
  valueShare: number;
  cumulativeDraw: number;
  incidents: number;
  insolvent: boolean;
  /** Violation-quarters published by an audit, across all pacts. */
  detected: number;
  /** Violation-quarters never published, across all pacts. */
  undetected: number;
}

export interface PactFinal {
  pactId: string;
  name: string;
  terms: PactTerms;
  status: 'active' | 'dissolved';
  createdRound: number;
  /** Members at the end of the session, in firm creation order. */
  members: string[];
  detected: number;
  undetected: number;
  /** firmId → violation-quarters. Only firms with at least one violation appear. */
  perFirm: Record<string, { detected: number; undetected: number }>;
  /**
   * firmId → one code per resolved quarter, quarter 1 first (§14.4 PACT RECORD strip): see `PactQuarterCode`.
   * Every firm ever checked against the terms, or in breach, appears; current members and former members alike.
   */
  quarters: Record<string, string>;
}

/** One character per quarter in `PactFinal.quarters`. */
export const PACT_QUARTER = {
  /** Not bound by the terms that quarter (not yet joined, left, expelled, or the pact had dissolved). */
  none: '-',
  /** Checked and kept the terms. */
  kept: 'c',
  /** Broke the terms; published by an audit. */
  detected: 'd',
  /** Broke the terms; never published. */
  undetected: 'u',
} as const;
export type PactQuarterCode = (typeof PACT_QUARTER)[keyof typeof PACT_QUARTER];

/**
 * Quarter codes for one pact (§9.2, §14.4). A breach outranks the checked note; a record written before
 * `checked` existed shows breaches only. Firms in creation order.
 */
export function pactQuarters(state: Pick<EngineState, 'firms' | 'round'>, pp: PactPrivate | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!pp) return out;
  for (const f of state.firms) {
    let line = '';
    let any = false;
    for (let r = 1; r <= state.round; r++) {
      const key = String(r);
      let code: PactQuarterCode = PACT_QUARTER.none;
      if (pp.violations[key]?.[f.id]) code = pp.detected[key]?.[f.id] ? PACT_QUARTER.detected : PACT_QUARTER.undetected;
      else if (pp.checked?.[key]?.[f.id]) code = PACT_QUARTER.kept;
      if (code !== PACT_QUARTER.none) any = true;
      line += code;
    }
    if (any) out[f.id] = line;
  }
  return out;
}

export type CounterfactualSummary = Omit<CounterfactualResult, 'incidentDraws'>;

export interface FinalResults {
  /** Quarters resolved. */
  rounds: number;
  collapseRound: number | null;
  /** τ, only when the "reveal threshold" setting is on; otherwise null. */
  tau: number | null;
  /** Trust before quarter 1. */
  startTrust: number;
  /** Trust after each quarter. */
  trust: number[];
  final: Record<string, FirmFinal>;
  industry: { actual: number; counterfactual: number; destroyed: number };
  counterfactual: CounterfactualSummary;
  /** Ranked by draw share, highest first. */
  attribution: AttributionRow[];
  pacts: PactFinal[];
  dataLines: string[];
}

/** DATA lines for every resolved quarter, in the order `resolveRound` emitted them (§8.4). */
export function dataLinesOf(state: EngineState): string[] {
  const out: string[] = [];
  for (const rec of state.history) {
    const g = { label: state.label, round: rec.round, T: rec.T, M: rec.M, collapsed: rec.collapsed };
    for (const f of state.firms) {
      const r = rec.firms[f.id];
      if (r) out.push(dataLine(g, f, r));
    }
  }
  return out;
}

export function buildResults(state: EngineState, opts: { revealTau: boolean }, p: Params = PARAMS): FinalResults {
  const cf = runCounterfactual(state, p);
  const attr = attribution(state);
  const industry = compareIndustry(state, cf);
  const share = new Map(attr.map((a) => [a.firmId, a]));

  const pacts: PactFinal[] = state.pacts.map((pact) => {
    const pp = state.pactsPrivate[pact.id];
    const perFirm: PactFinal['perFirm'] = {};
    let detected = 0;
    let undetected = 0;
    for (const [round, byFirm] of Object.entries(pp?.violations ?? {})) {
      for (const firmId of Object.keys(byFirm)) {
        const row = (perFirm[firmId] ??= { detected: 0, undetected: 0 });
        if (pp?.detected[round]?.[firmId]) {
          row.detected++;
          detected++;
        } else {
          row.undetected++;
          undetected++;
        }
      }
    }
    return {
      pactId: pact.id,
      name: pact.name,
      terms: pact.terms,
      status: pact.status,
      createdRound: pact.createdRound,
      members: state.firms.filter((f) => f.id in pact.members).map((f) => f.id),
      detected,
      undetected,
      perFirm,
      quarters: pactQuarters(state, pp),
    };
  });

  const final: Record<string, FirmFinal> = {};
  for (const f of state.firms) {
    const a = share.get(f.id);
    let detected = 0;
    let undetected = 0;
    for (const pf of pacts) {
      detected += pf.perFirm[f.id]?.detected ?? 0;
      undetected += pf.perFirm[f.id]?.undetected ?? 0;
    }
    final[f.id] = {
      firmId: f.id,
      ticker: f.ticker,
      isBot: f.isBot,
      rank: f.rank,
      valuation: f.valuation,
      peakValuation: f.peakValuation,
      counterfactual: cf.byFirm[f.id] ?? cf.perFirm,
      drawShare: a?.drawShare ?? 0,
      valueShare: a?.valueShare ?? 0,
      cumulativeDraw: f.cumulativeDraw,
      incidents: f.incidents,
      insolvent: f.insolvent,
      detected,
      undetected,
    };
  }

  const first = state.history[0];
  const { incidentDraws: _draws, ...cfSummary } = cf;
  return {
    rounds: state.round,
    collapseRound: state.collapseRound,
    tau: opts.revealTau ? state.tau : null,
    startTrust: first ? first.T - first.dT : state.T,
    trust: state.history.map((h) => h.T),
    final,
    industry: { actual: industry.actualTotal, counterfactual: industry.counterfactualTotal, destroyed: industry.valueDestroyed },
    counterfactual: cfSummary,
    attribution: attr,
    pacts,
    dataLines: dataLinesOf(state),
  };
}
