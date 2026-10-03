/**
 * Chart geometry (spec §16.3 `LineChart`). Pure functions only: no DOM, no React. Every chart on the projector, the phone
 * and the results screen derives its scales, ticks, path and label positions from here, so labels are always drawn on
 * the same scale as the data.
 */
import { quarterLabel } from './format';

export type Domain = readonly [number, number];

/** Maps `domain` linearly onto `range`. A zero-width domain maps every value to the middle of the range. */
export function linearScale(domain: Domain, range: Domain): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** A "nice" step (1, 2, 2.5 or 5 × 10^k) that divides `span` into at most `maxTicks` intervals. */
export function niceStep(span: number, maxTicks: number): number {
  const target = Math.abs(span) / Math.max(1, maxTicks);
  if (!(target > 0) || !Number.isFinite(target)) return 1;
  const mag = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * mag >= target - 1e-12) return m * mag;
  }
  return 10 * mag;
}

/** Widens [lo, hi] outwards to whole multiples of a nice step. Returns the domain and the step. */
export function niceDomain(lo: number, hi: number, maxTicks = 5): { domain: Domain; step: number } {
  let a = Math.min(lo, hi);
  let b = Math.max(lo, hi);
  if (a === b) {
    if (a === 0) b = 1;
    else if (a > 0) a = 0;
    else b = 0;
  }
  const step = niceStep(b - a, maxTicks);
  const d0 = Math.floor(a / step + 1e-9) * step;
  const d1 = Math.ceil(b / step - 1e-9) * step;
  return { domain: [clean(d0), clean(d1)], step };
}

/** Tick values from `domain[0]` to `domain[1]` in steps of `step`. A domain that crosses zero always has a tick at 0. */
export function niceTicks(domain: Domain, step: number): number[] {
  const out: number[] = [];
  const first = Math.ceil(domain[0] / step - 1e-9);
  const last = Math.floor(domain[1] / step + 1e-9);
  for (let k = first; k <= last; k++) out.push(clean(k * step));
  return out;
}

/** Removes floating-point noise such as 0.30000000000000004 and −0. */
function clean(v: number): number {
  const r = Math.round(v * 1e9) / 1e9;
  return r === 0 ? 0 : r;
}

export type DomainKind = 'trust' | 'zero';

/**
 * The y domain and ticks for a chart. `trust` is always 0–100. `zero` always includes 0 and is widened to nice steps;
 * it is never the min-to-max of the data.
 */
export function yDomain(kind: DomainKind, series: ReadonlyArray<ReadonlyArray<number>>, maxTicks = 5): { domain: Domain; ticks: number[] } {
  if (kind === 'trust') return { domain: [0, 100], ticks: [0, 25, 50, 75, 100] };
  const all = series.flat().filter((v) => Number.isFinite(v));
  const { domain, step } = niceDomain(Math.min(0, ...all), Math.max(0, ...all), maxTicks);
  return { domain, ticks: niceTicks(domain, step) };
}

/**
 * x position of point i of `count`, the first on `left` and the last on `right`, so the line always reaches both ends
 * of its axis. A single point sits in the middle.
 */
export function xPositions(count: number, left: number, right: number): (i: number) => number {
  if (count <= 1) return () => (left + right) / 2;
  const step = (right - left) / (count - 1);
  return (i: number) => left + i * step;
}

/** SVG path of straight segments between consecutive points. No curves, no fill. */
export function linePath(values: ReadonlyArray<number>, x: (i: number) => number, y: (v: number) => number): string {
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${round2(x(i))} ${round2(y(v))}`).join(' ');
}

/** Closed polygon between two series of equal length (the hatched gap): along `upper`, back along `lower`. */
export function bandPath(
  upper: ReadonlyArray<number>,
  lower: ReadonlyArray<number>,
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  const n = Math.min(upper.length, lower.length);
  if (n < 2) return '';
  const pts: string[] = [];
  for (let i = 0; i < n; i++) pts.push(`${i === 0 ? 'M' : 'L'}${round2(x(i))} ${round2(y(upper[i] as number))}`);
  for (let i = n - 1; i >= 0; i--) pts.push(`L${round2(x(i))} ${round2(y(lower[i] as number))}`);
  return `${pts.join(' ')} Z`;
}

const round2 = (v: number): string => String(Math.round(v * 100) / 100);

export interface QuarterTick {
  /** Point index in the series. */
  index: number;
  /** Quarter number the point closes (0 is the opening value). */
  quarter: number;
  /** Year boundary: drawn as a longer tick. */
  major: boolean;
  /** `START` for the opening value, the quarter for the first point otherwise, `Y2`, `Y3`… at year boundaries; else null. */
  label: string | null;
}

/** One tick per point; year boundaries (after Q4, Q8, …) are major and labelled with the year that starts there. */
export function quarterTicks(count: number, startQuarter = 0): QuarterTick[] {
  const out: QuarterTick[] = [];
  for (let i = 0; i < count; i++) {
    const quarter = startQuarter + i;
    const major = quarter % 4 === 0;
    let label: string | null = null;
    if (i === 0) label = quarter === 0 ? 'START' : quarterLabel(quarter);
    else if (major) label = `Y${quarter / 4 + 1}`;
    out.push({ index: i, quarter, major, label });
  }
  return out;
}

export interface Change {
  /** Index of the point the change leads to (1 or more). */
  index: number;
  delta: number;
}

/** Change from each point to the next: one entry per point after the first. */
export function changes(values: ReadonlyArray<number>): Change[] {
  const out: Change[] = [];
  for (let i = 1; i < values.length; i++) out.push({ index: i, delta: (values[i] as number) - (values[i - 1] as number) });
  return out;
}

/** The largest fall (the most negative change; the earliest on a tie), or null when nothing fell. */
export function largestDrop(values: ReadonlyArray<number>): Change | null {
  let worst: Change | null = null;
  for (const c of changes(values)) if (c.delta < 0 && (worst === null || c.delta < worst.delta)) worst = c;
  return worst;
}

/** Indices of points reached by a fall of `minFall` or more (spec: a trust loss of 5 or more). */
export function alarmIndices(values: ReadonlyArray<number>, minFall: number): number[] {
  return changes(values)
    .filter((c) => c.delta <= -minFall)
    .map((c) => c.index);
}

/**
 * Positions for labels on one axis: each as close to its wanted position as possible, inside [lo, hi] and at least
 * `gap` apart, in the same order as the wanted positions. If they cannot all fit they are spread evenly over [lo, hi].
 */
export function placeLabels(wanted: ReadonlyArray<number>, gap: number, lo: number, hi: number): number[] {
  const n = wanted.length;
  if (n === 0) return [];
  const order = wanted.map((w, i) => ({ w, i })).sort((a, b) => a.w - b.w || a.i - b.i);
  if (gap * (n - 1) > hi - lo) {
    const out = new Array<number>(n);
    order.forEach((o, k) => (out[o.i] = n === 1 ? (lo + hi) / 2 : lo + (k * (hi - lo)) / (n - 1)));
    return out;
  }
  const p = order.map((o) => Math.min(hi, Math.max(lo, o.w)));
  for (let k = 1; k < n; k++) p[k] = Math.max(p[k] as number, (p[k - 1] as number) + gap);
  if ((p[n - 1] as number) > hi) {
    p[n - 1] = hi;
    for (let k = n - 2; k >= 0; k--) p[k] = Math.min(p[k] as number, (p[k + 1] as number) - gap);
  }
  const out = new Array<number>(n);
  order.forEach((o, k) => (out[o.i] = p[k] as number));
  return out;
}

/** Start x of a label `width` wide centred on `x`, moved so it stays inside [lo, hi]. */
export function clampSpan(x: number, width: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi - width, x - width / 2));
}

/**
 * Which of a row of centred labels to keep so that none overlap: walks left to right, keeping a label only if it starts
 * at least `gap` after the last kept one ends. The first and last labels are preferred.
 */
export function fitLabels(items: ReadonlyArray<{ x: number; width: number }>, gap: number, lo: number, hi: number): boolean[] {
  const keep = items.map(() => false);
  if (items.length === 0) return keep;
  const span = (k: number) => {
    const it = items[k] as { x: number; width: number };
    const s = clampSpan(it.x, it.width, lo, hi);
    return [s, s + it.width] as const;
  };
  const lastK = items.length - 1;
  const [lastStart] = span(lastK);
  let end = -Infinity;
  for (let k = 0; k <= lastK; k++) {
    const [s, e] = span(k);
    if (s < end + gap) continue;
    if (k !== lastK && lastK > 0 && e + gap > lastStart) continue;
    keep[k] = true;
    end = e;
  }
  return keep;
}

/** Decimal places needed to print every tick distinctly (0 for whole-number steps). */
export function tickDecimals(ticks: ReadonlyArray<number>): number {
  let d = 0;
  for (const t of ticks) {
    while (d < 4 && Math.abs(Math.round(t * 10 ** d) - t * 10 ** d) > 1e-6) d++;
  }
  return d;
}
