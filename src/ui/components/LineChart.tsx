import { useId, type CSSProperties, type ReactElement } from 'react';
import {
  alarmIndices,
  bandPath,
  changes,
  clampSpan,
  fitLabels,
  largestDrop,
  linearScale,
  linePath,
  placeLabels,
  quarterTicks,
  tickDecimals,
  xPositions,
  yDomain,
  type DomainKind,
} from '../chart';
import { fmt, quarterLabel } from '../format';
import { CH, svgId, useChartSize } from './useChartSize';

export type ChartTone = 'signal' | 'wire' | 'dim' | 'down';

export interface ChartSeries {
  values: ReadonlyArray<number>;
  label: string;
  tone?: ChartTone;
}

interface Props {
  /** The first series is the primary one: it carries the quarter markers, alarms and change strip. */
  series: ReadonlyArray<ChartSeries>;
  /** `trust` is always 0–100; `zero` always includes 0. */
  domain: DomainKind;
  /** Quarter that the first value closes (0 is the opening value before quarter 1). */
  startQuarter?: number;
  /** One bar per quarter under the plot showing the change. */
  changeStrip?: boolean;
  /** Falls of this size or more get red markers, and the largest fall is labelled (trust charts: 5). */
  alarmDrop?: number;
  /** Labelled horizontal reference line; `band` hatches the area below it. */
  reference?: { value: number; label: string; band?: boolean };
  /** Labelled vertical marker at a point index. */
  marker?: { index: number; label: string };
  /** Hatch the gap between the first two series. */
  hatchBetween?: boolean;
  /** Print each series' label next to its end tag (charts with two or more series). */
  endLabels?: boolean;
  description: string;
  /** CSS height of the chart; omit to fill a flex column parent. */
  height?: string;
  /** Formats the end tags and the drop label. */
  format?: (v: number) => string;
}

/** Line chart (spec §16.3): straight segments, quarter markers, in-chart axes on the data's own scale. */
export function LineChart(props: Props) {
  const { series, height, description } = props;
  const [ref, size] = useChartSize<HTMLDivElement>();
  const reactId = useId();
  const primary = series[0]?.values ?? [];
  const start = props.startQuarter ?? 0;
  const style: CSSProperties = height ? { height } : { flex: '1 1 0', minHeight: '6lh' };

  if (primary.length < 2) {
    const text = primary.length === 1 && start > 0 ? '1 quarter resolved' : 'No quarter resolved yet';
    return (
      <div ref={ref} className="lchart lchart-empty" style={style} role="img" aria-label={`${description}. ${text}.`}>
        <span>{text}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="lchart" style={style}>
      <ChartSvg {...props} w={size.w} h={size.h} fs={size.fs} idBase={reactId} />
    </div>
  );
}

function ChartSvg(p: Props & { w: number; h: number; fs: number; idBase: string }) {
  const { w: W, h: H, fs, series } = p;
  const cw = fs * CH;
  const lh = fs * 1.35;
  const fmtV = p.format ?? ((v: number) => fmt(v, 1));
  const values = series[0]?.values ?? [];
  const n = values.length;
  const start = p.startQuarter ?? 0;

  // Vertical layout: top pad (marker label), main plot, change strip, x axis.
  const top = p.marker ? lh * 1.5 : lh * 0.75;
  const axisH = fs * 0.5 + lh;
  const stripTitleH = p.changeStrip ? lh * 1.1 : 0;
  const stripH = p.changeStrip ? Math.max(lh * 2.5, (H - top - axisH) * 0.22) : 0;
  const mainBottom = Math.max(top + lh * 2, H - axisH - stripTitleH - stripH);

  // y scale and ticks.
  const maxTicks = Math.max(2, Math.min(6, Math.floor((mainBottom - top) / (lh * 1.6))));
  const { domain, ticks } = yDomain(p.domain, series.map((s) => s.values), maxTicks);
  const decimals = tickDecimals(ticks);
  const tickText = ticks.map((t) => fmt(t, decimals));
  const Y = linearScale(domain, [mainBottom, top]);

  // Right axis wide enough for tick labels and end tags.
  const ends = series.map((s) => s.values[s.values.length - 1] ?? 0);
  const endText = ends.map(fmtV);
  const axisChars = Math.max(...tickText.map((t) => t.length), ...endText.map((t) => t.length + 1));
  const right = W - cw * (axisChars + 2);
  const left = cw * 0.75;
  const X = xPositions(n, left, right);
  const stepPx = n > 1 ? (right - left) / (n - 1) : right - left;
  const sq = Math.max(3, Math.min(fs * 0.55, stepPx * 0.6));

  // End tags, kept apart and inside the chart.
  const tagY = placeLabels(ends.map(Y), lh, lh / 2, mainBottom);
  const tagX = right + cw * 0.5;

  const hatch = svgId(p.idBase, 'h');
  const hatchDown = svgId(p.idBase, 'hd');
  const alarms = new Set(p.alarmDrop !== undefined ? alarmIndices(values, p.alarmDrop) : []);
  const drop = p.alarmDrop !== undefined ? largestDrop(values) : null;

  const out: ReactElement[] = [];

  // Gridlines and y labels. Labels hidden where an end tag sits.
  ticks.forEach((t, k) => {
    const y = Y(t);
    out.push(<line key={`g${k}`} className={t === 0 ? 'lc-zero' : 'lc-grid'} x1={left} x2={right} y1={y} y2={y} />);
    if (tagY.every((ty) => Math.abs(ty - y) >= lh * 0.9)) {
      out.push(
        <text key={`gt${k}`} className="lc-ytick" x={right + cw} y={y} data-y={y.toFixed(2)} dominantBaseline="central">
          {tickText[k]}
        </text>,
      );
    }
  });

  // Reference line and hatched band below it.
  if (p.reference) {
    const ry = Y(p.reference.value);
    if (p.reference.band) out.push(<rect key="rband" x={left} y={ry} width={right - left} height={Math.max(0, Y(domain[0]) - ry)} fill={`url(#${hatchDown})`} />);
    out.push(<line key="ref" className="lc-ref" x1={left} x2={right} y1={ry} y2={ry} />);
    const ly = ry - lh * 0.6 > top ? ry - lh * 0.6 : ry + lh * 0.7;
    out.push(
      <text key="reft" className="lc-ref-label" x={left + cw} y={ly} dominantBaseline="central">
        {p.reference.label}
      </text>,
    );
  }

  // Hatched gap between the first two series.
  const second = series[1];
  if (p.hatchBetween && second) out.push(<path key="band" className="lc-band" d={bandPath(second.values, values, X, Y)} fill={`url(#${hatch})`} />);

  // Vertical marker.
  if (p.marker && p.marker.index >= 0 && p.marker.index < n) {
    const mx = X(p.marker.index);
    const width = cw * p.marker.label.length;
    out.push(<line key="mk" className="lc-mark" x1={mx} x2={mx} y1={top - lh * 0.3} y2={mainBottom} />);
    out.push(
      <text key="mkt" className="lc-mark-label" x={clampSpan(mx + width / 2 + cw * 0.5, width, 0, right)} y={top - lh * 0.75} dominantBaseline="central">
        {p.marker.label}
      </text>,
    );
  }

  // Lines, then markers on the primary series.
  series.forEach((s, k) => {
    out.push(<path key={`l${k}`} className={`lc-line lc-s-${s.tone ?? 'signal'}`} d={linePath(s.values, X, Y)} />);
  });
  const tone = series[0]?.tone ?? 'signal';
  values.forEach((v, i) => {
    const last = i === n - 1;
    const size = last ? sq * 1.4 : sq;
    const cls = i === 0 ? 'lc-pt-open' : alarms.has(i) ? 'lc-f-down' : `lc-f-${tone}`;
    out.push(<rect key={`p${i}`} className={`lc-pt ${cls}`} x={X(i) - size / 2} y={Y(v) - size / 2} width={size} height={size} data-alarm={alarms.has(i) ? '' : undefined} />);
  });

  // Largest drop label, below its marker unless that leaves the plot.
  if (drop) {
    const text = `▼${fmt(-drop.delta, 1)} ${quarterLabel(start + drop.index)}`;
    const width = cw * text.length;
    const py = Y(values[drop.index] as number);
    const ly = py + lh * 1.1 < mainBottom - lh * 0.3 ? py + lh * 1.1 : py - lh * 1.1;
    out.push(
      <text key="drop" className="lc-drop" x={clampSpan(X(drop.index), width, left, right)} y={ly} dominantBaseline="central">
        {text}
      </text>,
    );
  }

  // End tags and series names.
  series.forEach((s, k) => {
    const ty = tagY[k] as number;
    const text = endText[k] as string;
    out.push(<rect key={`tg${k}`} className={`lc-tag lc-f-${s.tone ?? 'signal'}`} x={tagX} y={ty - lh / 2} width={cw * (text.length + 1)} height={lh} />);
    out.push(
      <text key={`tgt${k}`} className="lc-tag-text" x={tagX + cw * 0.5} y={ty} dominantBaseline="central">
        {text}
      </text>,
    );
  });
  if (p.endLabels && series.length > 1) {
    const order = series.map((_, k) => k).sort((a, b) => (ends[b] as number) - (ends[a] as number));
    const wanted = series.map((_, k) => (tagY[k] as number) + (k === order[0] ? -lh : lh));
    const ly = placeLabels(wanted, lh, top + lh / 2, mainBottom - lh / 2);
    series.forEach((s, k) => {
      out.push(
        <text key={`nm${k}`} className={`lc-name lc-t-${s.tone ?? 'signal'}`} x={right - sq} y={ly[k]} textAnchor="end" dominantBaseline="central">
          {s.label}
        </text>,
      );
    });
  }

  // Change strip.
  if (p.changeStrip) {
    const stripTop = mainBottom + stripTitleH;
    const zy = stripTop + stripH / 2;
    const ch = changes(values);
    const labelled = p.alarmDrop !== undefined && stepPx >= cw * 6;
    const half = stripH / 2 - (labelled ? lh * 0.8 : 2);
    const maxAbs = Math.max(1, ...ch.map((c) => Math.abs(c.delta)));
    const bw = Math.max(2, Math.min(fs * 0.7, stepPx * 0.56));
    out.push(
      <text key="st" className="lc-strip-title" x={left} y={mainBottom + stripTitleH * 0.55} dominantBaseline="central">
        CHANGE PER QUARTER
      </text>,
    );
    out.push(<line key="sz" className="lc-zero" x1={left} x2={right} y1={zy} y2={zy} />);
    out.push(
      <text key="szt" className="lc-ytick" x={right + cw} y={zy} data-y={zy.toFixed(2)} dominantBaseline="central">
        0
      </text>,
    );
    ch.forEach((c) => {
      const bh = Math.max(1, (Math.abs(c.delta) / maxAbs) * half);
      const up = c.delta >= 0;
      out.push(<rect key={`b${c.index}`} className={`lc-bar ${up ? 'lc-f-up' : 'lc-f-down'}`} x={X(c.index) - bw / 2} y={up ? zy - bh : zy} width={bw} height={bh} />);
      if (labelled && Math.abs(c.delta) >= (p.alarmDrop as number)) {
        out.push(
          <text key={`bt${c.index}`} className={up ? 'lc-t-up' : 'lc-t-down'} x={X(c.index)} y={up ? zy - bh - lh * 0.45 : zy + bh + lh * 0.45} textAnchor="middle" dominantBaseline="central">
            {(up ? '▲' : '▼') + fmt(Math.abs(c.delta), 1)}
          </text>,
        );
      }
    });
  }

  // x axis: one tick per quarter, longer at year boundaries, labels that fit.
  const axisY = H - axisH;
  const qt = quarterTicks(n, start);
  const labelled = qt.filter((t) => t.label !== null);
  const keep = fitLabels(labelled.map((t) => ({ x: X(t.index), width: cw * (t.label as string).length })), cw, 0, right + cw * 2);
  qt.forEach((t) => {
    const x = X(t.index);
    out.push(<line key={`x${t.index}`} className={t.major || t.index === 0 ? 'lc-tick-major' : 'lc-tick'} x1={x} x2={x} y1={axisY} y2={axisY + (t.major || t.index === 0 ? fs * 0.5 : fs * 0.25)} />);
  });
  labelled.forEach((t, k) => {
    if (!keep[k]) return;
    const width = cw * (t.label as string).length;
    out.push(
      <text key={`xt${t.index}`} className="lc-xtick" x={clampSpan(X(t.index), width, 0, right + cw * 2)} y={axisY + fs * 0.5 + lh / 2} dominantBaseline="central">
        {t.label}
      </text>,
    );
  });

  return (
    <svg
      className="lc"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={p.description}
      data-chart="line"
      data-plot-left={left.toFixed(2)}
      data-plot-right={right.toFixed(2)}
      focusable="false"
    >
      <defs>
        <pattern id={hatch} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="lc-hatch" x1={0} y1={0} x2={0} y2={6} />
        </pattern>
        <pattern id={hatchDown} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="lc-hatch-down" x1={0} y1={0} x2={0} y2={6} />
        </pattern>
      </defs>
      {out}
    </svg>
  );
}
