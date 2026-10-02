import { describe, expect, it } from 'vitest';
import {
  PARAMS,
  attribution,
  buildResults,
  compareIndustry,
  dataLinesOf,
  nextPactName,
  resolveRound,
  runCounterfactual,
  type EngineState,
  type Pact,
} from '../../src/engine';
import { dec, game } from './helpers';

/** A fixed-seed session: 6 firms, mixed policies, one pact with breaches, one audit, 9 quarters. */
function play(seed = 11, rounds = 9): { state: EngineState; dataLines: string[] } {
  const g = game(6, { seed, settings: { endMode: 'fixed', fixedEnd: rounds, minEnd: rounds, maxEnd: rounds }, p: PARAMS });
  const pact: Pact = {
    id: 'p1',
    name: nextPactName(g.pacts),
    proposer: 'f0',
    terms: { maxPace: 2, minSafety: 10 },
    members: { f0: 1, f1: 1, f2: 1 },
    createdRound: 1,
    status: 'active',
  };
  g.pacts.push(pact);
  let s = g;
  const dataLines: string[] = [];
  const policies = ['cautious', 'greedy', 'standard', 'greedy', 'cautious', 'standard'] as const;
  for (let r = 1; r <= rounds; r++) {
    if (r === 5) s = { ...s, pendingAudits: ['p1'] };
    const decisions = Object.fromEntries(
      s.firms.map((f, i) => {
        const pol = policies[i % policies.length];
        return [f.id, pol === 'cautious' ? dec(2, 15) : pol === 'greedy' ? dec(4, 0, r % 3 === 0 ? 'BLITZ' : 'NONE') : dec(3, 5)];
      }),
    );
    const res = resolveRound(s, decisions, PARAMS);
    s = res.state;
    dataLines.push(...res.dataLines);
  }
  return { state: s, dataLines };
}

describe('final results (spec §10, §14.4)', () => {
  const { state, dataLines } = play();

  it('final board matches the engine state', () => {
    const r = buildResults(state, { revealTau: false });
    expect(r.rounds).toBe(9);
    for (const f of state.firms) {
      const row = r.final[f.id];
      expect(row?.rank).toBe(f.rank);
      expect(row?.valuation).toBe(f.valuation);
      expect(row?.peakValuation).toBe(f.peakValuation);
      expect(row?.ticker).toBe(f.ticker);
    }
    expect(Object.values(r.final).map((x) => x.rank).sort((a, b) => a - b)).toEqual(state.firms.map((_, i) => i + 1));
  });

  it('counterfactual and headline figures equal the engine functions', () => {
    const r = buildResults(state, { revealTau: false });
    const cf = runCounterfactual(state);
    const cmp = compareIndustry(state, cf);
    expect(r.counterfactual.industryTotal).toBe(cf.industryTotal);
    expect(r.counterfactual.trust).toEqual(cf.trust);
    expect(r.counterfactual.byFirm).toEqual(cf.byFirm);
    expect(r.industry).toEqual({ actual: cmp.actualTotal, counterfactual: cmp.counterfactualTotal, destroyed: cmp.valueDestroyed });
    expect(r.industry.destroyed).toBeCloseTo(r.industry.counterfactual - r.industry.actual, 9);
    for (const f of state.firms) expect(r.final[f.id]?.counterfactual).toBe(cf.byFirm[f.id]);
  });

  it('attribution matches the engine and its shares sum to 1', () => {
    const r = buildResults(state, { revealTau: false });
    expect(r.attribution).toEqual(attribution(state));
    expect(r.attribution.reduce((a, x) => a + x.drawShare, 0)).toBeCloseTo(1, 9);
    const anyPositive = state.firms.some((f) => f.valuation > 0);
    // Negative valuations count as 0 (Session 2 interpretation), so shares sum to 0 when every firm is in debt.
    expect(r.attribution.reduce((a, x) => a + x.valueShare, 0)).toBeCloseTo(anyPositive ? 1 : 0, 9);
    for (const a of r.attribution) {
      expect(r.final[a.firmId]?.drawShare).toBe(a.drawShare);
      expect(r.final[a.firmId]?.cumulativeDraw).toBe(state.firms.find((f) => f.id === a.firmId)?.cumulativeDraw);
    }
  });

  it('value shares sum to 1 when firms hold positive value', () => {
    let g = game(5, { seed: 6 });
    for (let r = 0; r < 8; r++) g = resolveRound(g, Object.fromEntries(g.firms.map((f) => [f.id, dec(2, 15)])), PARAMS).state;
    expect(g.firms.some((f) => f.valuation > 0)).toBe(true);
    const r = buildResults(g, { revealTau: false });
    expect(r.attribution.reduce((a, x) => a + x.valueShare, 0)).toBeCloseTo(1, 9);
    expect(r.attribution.reduce((a, x) => a + x.drawShare, 0)).toBeCloseTo(1, 9);
  });

  it('trust trace is the history, with the opening value first', () => {
    const r = buildResults(state, { revealTau: false });
    expect(r.trust).toEqual(state.history.map((h) => h.T));
    const first = state.history[0];
    expect(r.startTrust).toBeCloseTo((first?.T ?? 0) - (first?.dT ?? 0), 9);
    expect(r.collapseRound).toBe(state.collapseRound);
  });

  it('shows tau only when the setting is on', () => {
    expect(buildResults(state, { revealTau: false }).tau).toBeNull();
    expect(buildResults(state, { revealTau: true }).tau).toBe(state.tau);
  });

  it('never carries the end round or the seed', () => {
    const text = JSON.stringify(buildResults(state, { revealTau: false }));
    expect(text).not.toContain('endRound');
    expect(text).not.toContain('"seed"');
    expect(text).not.toContain('incidentDraws');
  });

  it('pact record counts detected and undetected violation-quarters from the private record', () => {
    const r = buildResults(state, { revealTau: false });
    const pp = state.pactsPrivate.p1;
    const total = Object.values(pp?.violations ?? {}).reduce((n, byFirm) => n + Object.keys(byFirm).length, 0);
    const found = Object.values(pp?.detected ?? {}).reduce((n, byFirm) => n + Object.keys(byFirm).length, 0);
    expect(total).toBeGreaterThan(0);
    const pact = r.pacts[0];
    expect(pact?.detected).toBe(found);
    expect(pact?.undetected).toBe(total - found);
    expect(pact?.detected).toBeGreaterThan(0);
    expect(pact?.undetected).toBeGreaterThan(0);
    const sumDet = Object.values(r.final).reduce((n, f) => n + f.detected, 0);
    const sumUnd = Object.values(r.final).reduce((n, f) => n + f.undetected, 0);
    expect(sumDet).toBe(found);
    expect(sumUnd).toBe(total - found);
    expect(r.final.f3?.undetected).toBe(0);
  });

  it('DATA lines equal the lines emitted at resolution', () => {
    expect(dataLinesOf(state)).toEqual(dataLines);
    expect(buildResults(state, { revealTau: false }).dataLines).toEqual(dataLines);
    expect(dataLines).toHaveLength(9 * 6);
  });

  it('is deterministic for a fixed seed', () => {
    const a = buildResults(play(11).state, { revealTau: true });
    const b = buildResults(play(11).state, { revealTau: true });
    expect(a).toEqual(b);
    expect(buildResults(play(12).state, { revealTau: true })).not.toEqual(a);
  });

  it('handles a session with no resolved quarter', () => {
    const g = game(3, { seed: 4 });
    const r = buildResults(g, { revealTau: false });
    expect(r.rounds).toBe(0);
    expect(r.trust).toEqual([]);
    expect(r.startTrust).toBe(g.T);
    expect(r.dataLines).toEqual([]);
  });
});
