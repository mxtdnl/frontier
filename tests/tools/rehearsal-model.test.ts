import { describe, expect, it } from 'vitest';
import { REHEARSAL_QUARTERS, simulateRehearsal } from '../../scripts/lib/rehearsal-model';

const SEED = 2; // keep equal to SEED in scripts/e2e-rehearsal.ts

describe('rehearsal replica', () => {
  it('the fixed rehearsal seed ends in a moratorium inside the 14 quarters, with margin on both sides', () => {
    const r = simulateRehearsal(SEED);
    expect(r.trust).toHaveLength(REHEARSAL_QUARTERS);
    expect(r.collapseRound).not.toBeNull();
    expect(r.collapseRound!).toBeGreaterThanOrEqual(8);
    expect(r.collapseRound!).toBeLessThanOrEqual(11);
  });
  it('is deterministic', () => {
    expect(simulateRehearsal(SEED)).toEqual(simulateRehearsal(SEED));
  });
});
