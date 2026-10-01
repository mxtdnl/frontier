/** Regression guard: C1–C4 hold for the committed parameters (reduced seeds; the full run is npm run calibrate). */
import { describe, expect, it } from 'vitest';
import { PARAMS } from '../../src/engine';
import { runConditions } from '../../tools/calibration/scenarios';

describe('calibration smoke', () => {
  for (const n of [4, 12]) {
    it(`C1–C4 pass at N=${n} over 40 seeds`, () => {
      const r = runConditions(PARAMS, n, 40);
      for (const c of r.conditions) expect(c.pass, `${c.id} ${JSON.stringify(c.detail)}`).toBe(true);
    });
  }
});
