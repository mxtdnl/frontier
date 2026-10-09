import { describe, expect, it } from 'vitest';
import { byPace, estimatedCost, exposureLabel, exposureOf, PARAMS } from '../../src/engine';

const p = PARAMS;

describe('public exposure label', () => {
  it('keeps the §6.5 meaning: at safety 0, pace 1–4 read LOW, MED, HIGH, SEVERE', () => {
    expect(([1, 2, 3, 4] as const).map((pace) => exposureLabel(exposureOf(pace, 0, p), p))).toEqual(['LOW', 'MED', 'HIGH', 'SEVERE']);
  });

  it('falls as safety rises', () => {
    expect(exposureLabel(exposureOf(4, 30, p), p)).toBe('HIGH');
    expect(exposureLabel(exposureOf(2, 30, p), p)).toBe('LOW');
  });

  it('moves at the Session 17 boundaries (docs/CALIBRATION.md)', () => {
    const at = (pace: 1 | 2 | 3 | 4, s: number) => exposureLabel(exposureOf(pace, s, p), p);
    for (let s = 0; s <= 30; s++) expect(at(1, s)).toBe('LOW');
    expect([at(2, 20), at(2, 21)]).toEqual(['MED', 'LOW']);
    expect([at(3, 20), at(3, 21)]).toEqual(['HIGH', 'MED']);
    expect([at(4, 11), at(4, 12)]).toEqual(['SEVERE', 'HIGH']);
  });

  it('includes the RUSH doubling of d_i', () => {
    expect(exposureOf(2, 0, p, 'RUSH')).toBeCloseTo(2 * exposureOf(2, 0, p), 12);
    expect(exposureLabel(exposureOf(3, 0, p, 'RUSH'), p)).toBe('SEVERE');
    expect(exposureOf(3, 10, p, 'SHARE')).toBe(exposureOf(3, 10, p));
  });

  it('cutoffs are boundaries: LOW < a ≤ MED < b ≤ HIGH < c ≤ SEVERE', () => {
    const [a, b, c] = p.EXPO_CUTS;
    expect(exposureLabel(a - 1e-9, p)).toBe('LOW');
    expect(exposureLabel(a, p)).toBe('MED');
    expect(exposureLabel(b, p)).toBe('HIGH');
    expect(exposureLabel(c, p)).toBe('SEVERE');
  });
});

describe('estimated cost', () => {
  it('is compute + safety + card', () => {
    expect(estimatedCost(3, 12, 'POACH', p)).toBe(byPace(p.COMPUTE_COST, 3) + 12 * p.BUDGET_REF + p.CARD_COST.POACH);
    expect(estimatedCost(1, 0, 'NONE', p)).toBe(byPace(p.COMPUTE_COST, 1));
  });
});
