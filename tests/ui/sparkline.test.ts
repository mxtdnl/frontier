import { describe, expect, it } from 'vitest';
import { stepPath } from '../../src/ui/components/StepSparkline';

describe('stepPath', () => {
  it('draws square steps: horizontal run then vertical rise, no curves', () => {
    const d = stepPath([0, 50, 100], 0, 100, 3);
    expect(d).toBe('M0 1.0000 H1 V0.5000 H2 V0.0000 H3');
    expect(d).not.toMatch(/[CQSTAL]/);
  });
  it('clamps values to the axis', () => {
    expect(stepPath([200], 0, 100, 1)).toBe('M0 0.0000 H1');
  });
  it('returns nothing for an empty series', () => {
    expect(stepPath([], 0, 100, 0)).toBe('');
  });
});
