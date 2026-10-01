/** Counterfactual replay and attribution (spec §10). */
import { PARAMS, type Params } from './params';
import { createGame, resolveRound } from './resolve';
import type { EngineState } from './types';

export interface CounterfactualResult {
  rounds: number;
  /** Industry total final valuation on the counterfactual path. */
  industryTotal: number;
  /** Mean final valuation per firm (§10: equal across firms up to incident luck). */
  perFirm: number;
  /** Final valuation per firm id. */
  byFirm: Record<string, number>;
  /** Trust after each round. */
  trust: number[];
  collapseRound: number | null;
  /** Incident draws by round (index 0 = round 1), by firm creation order. */
  incidentDraws: number[][];
}

/**
 * Replays from round 1 with the same N, seed, τ and number of rounds played. Every firm,
 * bots included, plays the sustainable policy: pace 2, safety 15, no cards, no pacts.
 * Incident draws come from the same (round, firm order) streams as the actual run.
 */
export function runCounterfactual(actual: EngineState, p: Params = PARAMS): CounterfactualResult {
  const firms = actual.firms.map((f) => ({ id: f.id, ticker: f.ticker, isBot: true, botPolicy: 'sustainable' as const }));
  let s = createGame(
    { label: actual.label, endMode: 'manual', minEnd: p.END_MIN, maxEnd: p.END_MAX, fixedEnd: null, disclosure: false, autoAuditP: 0 },
    firms,
    actual.seed,
    p,
  );
  s = { ...s, tau: actual.tau, endMode: actual.endMode, endRound: actual.endRound };
  const trust: number[] = [];
  const incidentDraws: number[][] = [];
  for (let r = 1; r <= actual.round; r++) {
    const res = resolveRound(s, {}, p);
    s = res.state;
    trust.push(s.T);
    incidentDraws.push(res.outputs.incidentDraws);
  }
  const byFirm: Record<string, number> = {};
  let industryTotal = 0;
  for (const f of s.firms) {
    byFirm[f.id] = f.valuation;
    industryTotal += f.valuation;
  }
  return {
    rounds: actual.round,
    industryTotal,
    perFirm: s.firms.length > 0 ? industryTotal / s.firms.length : 0,
    byFirm,
    trust,
    collapseRound: s.collapseRound,
    incidentDraws,
  };
}

export interface AttributionRow {
  firmId: string;
  /** Share of cumulative trust draw, 0–1. */
  drawShare: number;
  /** Share of final industry valuation, 0–1, counting negative valuations as 0. */
  valueShare: number;
  cumulativeDraw: number;
  valuation: number;
}

/** Per firm: share of depletion against share of value, ranked by depletion share. */
export function attribution(state: EngineState): AttributionRow[] {
  const totalDraw = state.firms.reduce((x, f) => x + f.cumulativeDraw, 0);
  const totalValue = state.firms.reduce((x, f) => x + Math.max(0, f.valuation), 0);
  return state.firms
    .map((f) => ({
      firmId: f.id,
      drawShare: totalDraw > 0 ? f.cumulativeDraw / totalDraw : 0,
      valueShare: totalValue > 0 ? Math.max(0, f.valuation) / totalValue : 0,
      cumulativeDraw: f.cumulativeDraw,
      valuation: f.valuation,
    }))
    .sort((a, b) => b.drawShare - a.drawShare || (state.firms.find((f) => f.id === a.firmId)?.order ?? 0) - (state.firms.find((f) => f.id === b.firmId)?.order ?? 0));
}

export interface IndustryComparison {
  actualTotal: number;
  counterfactualTotal: number;
  /** Counterfactual total − actual total. */
  valueDestroyed: number;
}

export function compareIndustry(actual: EngineState, cf: CounterfactualResult): IndustryComparison {
  const actualTotal = actual.firms.reduce((x, f) => x + f.valuation, 0);
  return { actualTotal, counterfactualTotal: cf.industryTotal, valueDestroyed: cf.industryTotal - actualTotal };
}
