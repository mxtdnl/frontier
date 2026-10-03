import { describe, expect, it } from 'vitest';
import {
  alarmIndices,
  bandPath,
  changes,
  clampSpan,
  fitLabels,
  largestDrop,
  linearScale,
  linePath,
  niceDomain,
  niceStep,
  niceTicks,
  placeLabels,
  quarterTicks,
  tickDecimals,
  xPositions,
  yDomain,
} from '../../src/ui/chart';

describe('linearScale', () => {
  it('maps the domain ends onto the range ends, including an inverted range', () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(100)).toBe(0);
    expect(y(25)).toBe(150);
  });
  it('maps every value to the middle when the domain has no width', () => {
    expect(linearScale([5, 5], [0, 10])(123)).toBe(5);
  });
});

describe('nice steps, domains and ticks', () => {
  it('chooses 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(10, 4)).toBe(2.5);
    expect(niceStep(7, 5)).toBe(2);
    expect(niceStep(0.9, 3)).toBe(0.5);
    expect(niceStep(0, 5)).toBe(1);
  });
  it('widens the domain outwards to whole steps', () => {
    expect(niceDomain(143, 197, 5)).toEqual({ domain: [140, 200], step: 20 });
    expect(niceDomain(143, 197, 6)).toEqual({ domain: [140, 200], step: 10 });
  });
  it('a domain that crosses zero has a tick at exactly 0', () => {
    const { domain, step } = niceDomain(-104.8, 828.6, 5);
    const ticks = niceTicks(domain, step);
    expect(domain[0]).toBeLessThanOrEqual(-104.8);
    expect(domain[1]).toBeGreaterThanOrEqual(828.6);
    expect(ticks).toContain(0);
    expect(ticks[0]).toBe(domain[0]);
    expect(ticks[ticks.length - 1]).toBe(domain[1]);
  });
  it('an all-negative domain still ends at 0 when 0 is included', () => {
    const { domain, step } = niceDomain(-75, 0, 4);
    expect(domain).toEqual([-80, 0]);
    expect(niceTicks(domain, step)).toEqual([-80, -60, -40, -20, 0]);
  });
  it('a single value widens to include zero; zero alone becomes 0–1', () => {
    expect(niceDomain(50, 50, 5).domain[0]).toBe(0);
    expect(niceDomain(-50, -50, 5).domain[1]).toBe(0);
    expect(niceDomain(0, 0, 5).domain).toEqual([0, 1]);
  });
  it('ticks carry no floating-point noise', () => {
    expect(niceTicks([0, 0.3], 0.1)).toEqual([0, 0.1, 0.2, 0.3]);
  });
  it('tick decimals print every tick distinctly', () => {
    expect(tickDecimals([0, 25, 50])).toBe(0);
    expect(tickDecimals([0, 0.5, 1])).toBe(1);
    expect(tickDecimals([0, 0.25])).toBe(2);
  });
});

describe('yDomain', () => {
  it('trust is always 0–100 whatever the data', () => {
    expect(yDomain('trust', [[61.8, 59.7]])).toEqual({ domain: [0, 100], ticks: [0, 25, 50, 75, 100] });
  });
  it('zero-based always includes 0 and is never min-to-max', () => {
    const { domain, ticks } = yDomain('zero', [[143, 160, 197]]);
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThanOrEqual(197);
    expect(ticks[0]).toBe(0);
  });
  it('zero-based covers negatives in every series', () => {
    const { domain, ticks } = yDomain('zero', [[100, 50], [20, -30]]);
    expect(domain[0]).toBeLessThanOrEqual(-30);
    expect(ticks).toContain(0);
  });
});

describe('x positions and paths', () => {
  it('the first point sits on the left edge and the last on the right edge', () => {
    const x = xPositions(14, 10, 400);
    expect(x(0)).toBe(10);
    expect(x(13)).toBeCloseTo(400, 9);
  });
  it('a single point sits in the middle', () => {
    expect(xPositions(1, 0, 100)(0)).toBe(50);
  });
  it('the line is straight segments only, no steps or curves', () => {
    const d = linePath([0, 50, 100], xPositions(3, 0, 200), linearScale([0, 100], [100, 0]));
    expect(d).toBe('M0 100 L100 50 L200 0');
    expect(d).not.toMatch(/[HVCQSTA]/);
  });
  it('a one-point series is a lone move with no segment', () => {
    expect(linePath([5], () => 0, (v) => v)).toBe('M0 5');
  });
  it('the band between two series is a closed polygon along one and back along the other', () => {
    const d = bandPath([10, 20], [0, 5], (i) => i * 10, (v) => v);
    expect(d).toBe('M0 10 L10 20 L10 5 L0 0 Z');
    expect(bandPath([1], [2], (i) => i, (v) => v)).toBe('');
  });
});

describe('quarter ticks', () => {
  it('labels START, then the year at each year boundary, with major ticks there', () => {
    const t = quarterTicks(15);
    expect(t).toHaveLength(15);
    expect(t[0]).toEqual({ index: 0, quarter: 0, major: true, label: 'START' });
    expect(t[4]).toEqual({ index: 4, quarter: 4, major: true, label: 'Y2' });
    expect(t[8]?.label).toBe('Y3');
    expect(t[5]).toEqual({ index: 5, quarter: 5, major: false, label: null });
    expect(t.filter((x) => x.major).map((x) => x.quarter)).toEqual([0, 4, 8, 12]);
  });
  it('a series starting at quarter 1 labels its first point with the quarter', () => {
    const t = quarterTicks(5, 1);
    expect(t[0]?.label).toBe('Q1 Y1');
    expect(t[3]).toEqual({ index: 3, quarter: 4, major: true, label: 'Y2' });
  });
});

describe('changes, drops and alarms', () => {
  const v = [72, 65.9, 67.4, 65.7, 59.8];
  it('gives one change per quarter after the first point', () => {
    const c = changes(v);
    expect(c.map((x) => x.index)).toEqual([1, 2, 3, 4]);
    expect(c[0]?.delta).toBeCloseTo(-6.1, 9);
    expect(c[1]?.delta).toBeCloseTo(1.5, 9);
  });
  it('the largest drop is the most negative change', () => {
    expect(largestDrop(v)?.index).toBe(1);
    expect(largestDrop([1, 2, 3])).toBeNull();
    expect(largestDrop([5])).toBeNull();
  });
  it('a tie keeps the earliest drop', () => {
    expect(largestDrop([10, 5, 5, 0])?.index).toBe(1);
  });
  it('alarms mark falls of the threshold or more', () => {
    expect(alarmIndices(v, 5)).toEqual([1, 4]);
    expect(alarmIndices([10, 5], 5)).toEqual([1]);
    expect(alarmIndices([10, 5.01], 5)).toEqual([]);
  });
  it('a one-point series has no changes', () => {
    expect(changes([50])).toEqual([]);
  });
});

describe('label placement', () => {
  it('leaves labels that are already apart where they are', () => {
    expect(placeLabels([10, 50], 10, 0, 100)).toEqual([10, 50]);
  });
  it('pushes overlapping labels apart, keeping their order', () => {
    const p = placeLabels([50, 52], 10, 0, 100);
    expect(p[1]! - p[0]!).toBeGreaterThanOrEqual(10);
    expect(p[0]).toBeLessThan(p[1]!);
  });
  it('keeps labels inside the bounds', () => {
    const p = placeLabels([98, 99, 100], 10, 0, 100);
    expect(Math.max(...p)).toBeLessThanOrEqual(100);
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0);
    expect(p[2]! - p[1]!).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(p[1]! - p[0]!).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(placeLabels([-5], 10, 0, 100)).toEqual([0]);
  });
  it('returns labels in input order when the input is unsorted', () => {
    const p = placeLabels([80, 20], 10, 0, 100);
    expect(p).toEqual([80, 20]);
  });
  it('spreads labels evenly when they cannot all fit', () => {
    expect(placeLabels([5, 5, 5], 100, 0, 10)).toEqual([0, 5, 10]);
  });
  it('clamps a centred span inside its bounds', () => {
    expect(clampSpan(50, 20, 0, 100)).toBe(40);
    expect(clampSpan(2, 20, 0, 100)).toBe(0);
    expect(clampSpan(99, 20, 0, 100)).toBe(80);
  });
  it('drops labels that would overlap, keeping the first and last', () => {
    const items = [0, 10, 20, 30, 100].map((x) => ({ x, width: 15 }));
    const keep = fitLabels(items, 2, 0, 110);
    expect(keep[0]).toBe(true);
    expect(keep[4]).toBe(true);
    expect(keep[1]).toBe(false);
    expect(keep.filter(Boolean).length).toBeGreaterThanOrEqual(3);
  });
});
