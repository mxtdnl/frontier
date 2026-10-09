/** Regression guard: C1–C5 hold for the committed parameters (reduced seeds; the full run is npm run calibrate). */
import { describe, expect, it } from 'vitest';
import { PARAMS } from '../../src/engine';
import { greedyCount, greedyShare, halfGreedy, NS, runConditions } from '../../tools/calibration/scenarios';

// 100 seeds: since Session 17 about 43% of all-greedy seeds reach the moratorium by quarter 4,
// so at 40 or 60 seeds the C1 median can land on 4.5 at N = 50 (the 200- and 500-seed runs give 5).
const SMOKE_SEEDS = 100;

describe('calibration smoke', () => {
  for (const n of [4, 12, 50]) {
    it(`C1–C5 pass at N=${n} over ${SMOKE_SEEDS} seeds`, () => {
      const r = runConditions(PARAMS, n, SMOKE_SEEDS);
      expect(r.conditions.map((c) => c.id)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
      for (const c of r.conditions) expect(c.pass, `${c.id} ${JSON.stringify(c.detail)}`).toBe(true);
    }, 60_000);
  }
});

describe('greedy-share rooms (§8.1 C5, §8.2)', () => {
  const greedyIn = (setups: ReturnType<typeof greedyShare>): number =>
    setups.filter((s) => s.kind === 'bot' && s.policy === 'greedy').length;

  it('C5 makes ⌊N/2⌋ firms greedy and the rest sustainable', () => {
    for (const n of NS) {
      const room = halfGreedy(n);
      expect(room).toHaveLength(n);
      expect(greedyIn(room)).toBe(Math.floor(n / 2));
      expect(room.filter((s) => s.kind === 'bot' && s.policy === 'sustainable')).toHaveLength(n - Math.floor(n / 2));
    }
  });

  it('greedy count is round(share × N) with at least 1', () => {
    expect(greedyCount(4, 1 / 4)).toBe(1);
    expect(greedyCount(4, 1 / 3)).toBe(1);
    expect(greedyCount(4, 2 / 3)).toBe(3);
    expect(greedyCount(6, 1 / 4)).toBe(2); // 1.5 rounds up
    expect(greedyCount(50, 1 / 3)).toBe(17);
    expect(greedyCount(2, 0.1)).toBe(1);
  });

  it('a greedy-share room has the stated number of greedy firms, greedy first', () => {
    const room = greedyShare(12, 1 / 3);
    expect(room).toHaveLength(12);
    expect(greedyIn(room)).toBe(4);
    expect(room.slice(0, 4).every((s) => s.kind === 'bot' && s.policy === 'greedy')).toBe(true);
  });
});
