import { describe, expect, it } from 'vitest';
import { fmt, fmtClock, fmtShare, fmtSigned, quarterLabel } from '../../src/ui/format';

describe('format', () => {
  it('labels quarters per spec §4', () => {
    expect(quarterLabel(1)).toBe('Q1 Y1');
    expect(quarterLabel(4)).toBe('Q4 Y1');
    expect(quarterLabel(7)).toBe('Q3 Y2');
    expect(quarterLabel(30)).toBe('Q2 Y8');
  });
  it('uses a true minus sign and signs deltas', () => {
    expect(fmt(-6.3)).toBe('−6.3');
    expect(fmtSigned(6.3)).toBe('+6.3');
    expect(fmtSigned(-6.3)).toBe('−6.3');
    expect(fmtSigned(0)).toBe('0.0');
    expect(fmt(-0.04)).toBe('0.0');
  });
  it('formats shares and clocks', () => {
    expect(fmtShare(0.214)).toBe('21.4%');
    expect(fmtClock(107_000)).toBe('01:47');
    expect(fmtClock(-5)).toBe('00:00');
    expect(fmtClock(500)).toBe('00:01');
  });
});
