export interface Series {
  values: ReadonlyArray<number>;
  tone?: 'signal' | 'wire' | 'dim' | 'down';
  label: string;
}

/** SVG path with square steps: horizontal run, then vertical rise. No smoothing, no fill. */
export function stepPath(values: ReadonlyArray<number>, min: number, max: number, count: number): string {
  if (values.length === 0) return '';
  const span = max - min || 1;
  const y = (v: number) => (1 - (Math.min(max, Math.max(min, v)) - min) / span).toFixed(4);
  let d = `M0 ${y(values[0] as number)}`;
  for (let i = 1; i < values.length; i++) {
    d += ` H${i} V${y(values[i] as number)}`;
  }
  // Hold the last value to the end of the final quarter.
  d += ` H${Math.max(values.length, count)}`;
  return d;
}

interface Props {
  series: ReadonlyArray<Series>;
  min: number;
  max: number;
  /** Width in ch (0 fills the container) and height in lines. */
  w: number;
  h: number;
  /** Number of quarter slots on the x axis (defaults to the longest series). */
  count?: number;
  /** Horizontal reference line at this value. */
  refLine?: number;
  /** Vertical marker at this index (e.g. the moratorium quarter). */
  markAt?: number;
  description: string;
}

export function StepSparkline({ series, min, max, w, h, count, refLine, markAt, description }: Props) {
  const n = count ?? Math.max(1, ...series.map((s) => s.values.length));
  const span = max - min || 1;
  return (
    <div className="spark" style={{ width: w > 0 ? `${w}ch` : '100%', height: `${h}lh` }} role="img" aria-label={description}>
      <svg viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" focusable="false">
        {refLine !== undefined ? (
          <path className="ref" d={`M0 ${(1 - (refLine - min) / span).toFixed(4)} H${n}`} />
        ) : null}
        {markAt !== undefined ? <path className="mark" d={`M${markAt + 0.5} 0 V1`} /> : null}
        {series.map((s) => (
          <path key={s.label} className={`s-${s.tone ?? 'signal'}`} d={stepPath(s.values, min, max, n)} />
        ))}
      </svg>
    </div>
  );
}
