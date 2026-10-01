import { describe, expect, it } from 'vitest';
import { REVEAL, planReveal, rollText } from '../../src/ui/reveal';

describe('planReveal', () => {
  it('staggers rows by 40 ms, top to bottom', () => {
    const p = planReveal(8, 0);
    expect(p.rollStart).toEqual([0, 40, 80, 120, 160, 200, 240, 280]);
  });
  it('moves rows in one 300 ms swap after the roll', () => {
    const p = planReveal(8, 0);
    expect(p.swapEnd - p.swapStart).toBe(300);
    expect(p.swapStart).toBe(p.rollEnd);
  });
  it('stays within 1200 ms for 8 firms, with and without the invert', () => {
    expect(planReveal(8, 0).total).toBeLessThanOrEqual(1200);
    expect(planReveal(8, -6.3).total).toBeLessThanOrEqual(1200);
  });
  it('inverts trust for 400 ms only when the fall is 5 or more', () => {
    const hit = planReveal(8, -5);
    expect(hit.invertStart).not.toBeNull();
    expect((hit.invertEnd ?? 0) - (hit.invertStart ?? 0)).toBe(REVEAL.invertMs);
    expect(planReveal(8, -4.9).invertStart).toBeNull();
    expect(planReveal(8, 2).invertStart).toBeNull();
  });
});

describe('rollText', () => {
  it('ends on the final value', () => {
    expect(rollText('68.1', '61.8', 1, 3)).toBe('61.8');
  });
  it('keeps the width and the decimal point while rolling', () => {
    for (let frame = 0; frame < 20; frame++) {
      for (const p of [0, 0.2, 0.5, 0.8]) {
        const out = rollText('68.1', '61.8', p, frame);
        expect(out).toHaveLength(4);
        expect(out[2]).toBe('.');
      }
    }
  });
  it('settles characters left to right', () => {
    const out = rollText('99.9', '12.3', 0.5, 7);
    expect(out.startsWith('1')).toBe(true);
  });
  it('handles values of different lengths', () => {
    expect(rollText('98.4', '102.1', 0.1, 1)).toHaveLength(5);
    expect(rollText('102.1', '98.4', 0.1, 1)).toHaveLength(4);
  });
});
