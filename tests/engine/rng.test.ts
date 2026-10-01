import { describe, expect, it } from 'vitest';
import { hash32, mulberry32, randInt, seedFor, streamRng } from '../../src/engine';

describe('rng', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('matches the canonical mulberry32 sequence for seed 1 (bryc reference implementation)', () => {
    const r = mulberry32(1);
    expect([r(), r(), r()].map((x) => x.toFixed(10))).toEqual(['0.6270739406', '0.0027357212', '0.5274470400']);
  });

  it('separates streams and rounds', () => {
    const seeds = new Set<number>();
    for (const stream of ['setup', 'incident', 'headline', 'audit', 'bot'] as const) {
      for (let round = 0; round <= 30; round++) seeds.add(seedFor(7, round, stream));
    }
    expect(seeds.size).toBe(5 * 31);
    expect(streamRng(7, 3, 'incident')()).toBe(streamRng(7, 3, 'incident')());
    expect(hash32('a')).not.toBe(hash32('b'));
  });

  it('randInt is inclusive and roughly uniform', () => {
    const r = mulberry32(5);
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 10000; i++) counts[randInt(r, 10, 14) - 10]!++;
    for (const c of counts) expect(c).toBeGreaterThan(1800);
  });
});
