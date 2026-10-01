import { describe, expect, it } from 'vitest';
import { attribution, compareIndustry, PARAMS, resolveRound, runCounterfactual } from '../../src/engine';
import { firm, game, run } from './helpers';

describe('counterfactual', () => {
  it('replays the same rounds with the same tau, every firm sustainable', () => {
    const s = run(game(6, { seed: 3, policy: 'greedy' }), 9, () => ({}));
    const cf = runCounterfactual(s);
    expect(cf.rounds).toBe(9);
    expect(cf.trust).toHaveLength(9);
    expect(Object.keys(cf.byFirm)).toEqual(s.firms.map((f) => f.id));
    expect(cf.industryTotal).toBeCloseTo(Object.values(cf.byFirm).reduce((a, b) => a + b, 0), 9);
    expect(cf.perFirm).toBeCloseTo(cf.industryTotal / 6, 9);
  });

  it('uses the actual tau, not a fresh draw', () => {
    const s = run(game(4, { seed: 5 }), 3, () => ({}));
    s.tau = 99;
    expect(runCounterfactual(s).collapseRound).toBe(1);
  });

  it('per-firm valuations differ only through incident luck', () => {
    const noInc = { ...PARAMS, INC_BASE: [0, 0, 0, 0] as const };
    const s = run(game(5, { seed: 8, p: noInc }), 10, () => ({}), noInc);
    const vals = Object.values(runCounterfactual(s, noInc).byFirm);
    for (const v of vals) expect(v).toBeCloseTo(vals[0]!, 9);
  });

  it('reports value destroyed as counterfactual minus actual', () => {
    const s = run(game(8, { seed: 2, policy: 'greedy' }), 12, () => ({}));
    const cf = runCounterfactual(s);
    const cmp = compareIndustry(s, cf);
    expect(cmp.valueDestroyed).toBeCloseTo(cf.industryTotal - cmp.actualTotal, 9);
  });
});

describe('attribution', () => {
  it('draw shares and value shares each sum to 1, ranked by draw share', () => {
    let s = game(4, { seed: 4 });
    for (let i = 0; i < 6; i++) s = resolveRound(s, { f0: { pace: 4, safety: 0, card: 'NONE', target: null } }).state;
    s.firms.forEach((f, i) => {
      f.valuation = 100 * (i + 1);
    });
    const rows = attribution(s);
    expect(rows.reduce((x, r) => x + r.drawShare, 0)).toBeCloseTo(1, 9);
    expect(rows.reduce((x, r) => x + r.valueShare, 0)).toBeCloseTo(1, 9);
    expect(rows[0]?.firmId).toBe('f0');
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.drawShare).toBeGreaterThanOrEqual(rows[i]!.drawShare);
  });

  it('counts negative valuations as zero value share', () => {
    const s = run(game(3), 2, () => ({}));
    firm(s, 'f1').valuation = -50;
    const row = attribution(s).find((r) => r.firmId === 'f1')!;
    expect(row.valueShare).toBe(0);
  });
});
