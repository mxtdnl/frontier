import type { ReactElement } from 'react';
import { clampSpan, fitLabels, linearScale, linePath, placeLabels, quarterTicks, xPositions } from '../chart';
import { rankAxis } from '../performance';
import { CH, useChartSize } from './useChartSize';

export interface RankLine {
  id: string;
  ticker: string;
  /** Rank in each resolved quarter, 1 at the top. */
  ranks: ReadonlyArray<number>;
  /** Highlight: the leader in amber, the largest faller in red; every other firm dim. */
  tone: 'leader' | 'faller' | 'other';
  /** Text at the line end, e.g. "HUMN 1st" or "BTC ▼3". */
  label: string;
}

interface Props {
  lines: ReadonlyArray<RankLine>;
  /** Quarter the first rank belongs to. */
  startQuarter: number;
  firmCount: number;
  description: string;
}

/** Rank by quarter as connected lines (spec §14.1 `RANKS`, Session 13). */
export function RankChart({ lines, startQuarter, firmCount, description }: Props) {
  const [ref, size] = useChartSize<HTMLDivElement>();
  const quarters = Math.max(0, ...lines.map((l) => l.ranks.length));
  if (quarters < 2) {
    const text = quarters === 1 ? '1 quarter resolved' : 'No quarter resolved yet';
    return (
      <div ref={ref} className="lchart lchart-empty" style={{ flex: '1 1 0', minHeight: '6lh' }} role="img" aria-label={`${description}. ${text}.`}>
        <span>{text}</span>
      </div>
    );
  }

  const { w: W, h: H, fs } = size;
  const cw = fs * CH;
  const lh = fs * 1.35;
  const n = Math.max(1, firmCount);
  const axis = rankAxis(n);
  const top = lh * 0.75;
  const axisH = fs * 0.5 + lh;
  const bottom = H - axisH - lh * 0.25;
  const left = cw * (String(n).length + 1.5);
  const labelChars = Math.max(...lines.map((l) => l.label.length));
  const right = W - cw * (labelChars + 2);
  const X = xPositions(quarters, left, right);
  const Y = n === 1 ? () => (top + bottom) / 2 : linearScale([1, n], [top, bottom]);

  const out: ReactElement[] = [];
  axis.forEach((r) => {
    const y = Y(r);
    out.push(<line key={`g${r}`} className="lc-grid" x1={left} x2={right} y1={y} y2={y} />);
    out.push(
      <text key={`gt${r}`} className="lc-ytick" x={left - cw * 0.75} y={y} data-y={y.toFixed(2)} textAnchor="end" dominantBaseline="central">
        {r}
      </text>,
    );
  });

  // Dim lines first, then the faller, then the leader on top.
  const order = { other: 0, faller: 1, leader: 2 } as const;
  const sorted = [...lines].sort((a, b) => order[a.tone] - order[b.tone]);
  const sq = Math.max(4, Math.min(fs * 0.55, ((right - left) / Math.max(1, quarters - 1)) * 0.6));
  sorted.forEach((l) => {
    const cls = l.tone === 'leader' ? 'lc-s-signal rc-hi' : l.tone === 'faller' ? 'lc-s-down rc-hi' : 'rc-other';
    out.push(<path key={`l${l.id}`} className={`lc-line ${cls}`} d={linePath(l.ranks, X, Y)} data-rank-line={l.ticker} data-tone={l.tone} />);
    if (l.tone !== 'other') {
      l.ranks.forEach((r, i) => {
        out.push(<rect key={`p${l.id}-${i}`} className={l.tone === 'leader' ? 'lc-f-signal' : 'lc-f-down'} x={X(i) - sq / 2} y={Y(r) - sq / 2} width={sq} height={sq} />);
      });
    }
  });

  // End labels: the highlighted firms always; the others where they do not overlap.
  const hi = lines.filter((l) => l.tone !== 'other');
  const endY = (l: RankLine) => Y(l.ranks[l.ranks.length - 1] as number);
  const hiY = placeLabels(hi.map(endY), lh, lh / 2, H - axisH);
  const kept: number[] = [...hiY];
  const labels: Array<{ l: RankLine; y: number }> = hi.map((l, k) => ({ l, y: hiY[k] as number }));
  [...lines]
    .filter((l) => l.tone === 'other')
    .sort((a, b) => (a.ranks[a.ranks.length - 1] as number) - (b.ranks[b.ranks.length - 1] as number))
    .forEach((l) => {
      const y = endY(l);
      if (kept.every((k) => Math.abs(k - y) >= lh * 0.95)) {
        kept.push(y);
        labels.push({ l, y });
      }
    });
  labels.forEach(({ l, y }) => {
    const cls = l.tone === 'leader' ? 'lc-t-signal lc-name' : l.tone === 'faller' ? 'lc-t-down lc-name' : 'lc-t-dim';
    out.push(
      <text key={`e${l.id}`} className={cls} x={right + cw} y={y} dominantBaseline="central" data-end-label={l.ticker}>
        {l.label}
      </text>,
    );
  });

  // x axis: a tick per quarter, longer at year boundaries, labels that fit.
  const axisY = H - axisH;
  const qt = quarterTicks(quarters, startQuarter);
  const labelled = qt.filter((t) => t.label !== null);
  const keep = fitLabels(labelled.map((t) => ({ x: X(t.index), width: cw * (t.label as string).length })), cw, 0, right + cw * 2);
  qt.forEach((t) => {
    const x = X(t.index);
    const major = t.major || t.index === 0;
    out.push(<line key={`x${t.index}`} className={major ? 'lc-tick-major' : 'lc-tick'} x1={x} x2={x} y1={axisY} y2={axisY + (major ? fs * 0.5 : fs * 0.25)} />);
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
    <div ref={ref} className="lchart" style={{ flex: '1 1 0', minHeight: '6lh' }}>
      <svg
        className="lc"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={description}
        data-chart="ranks"
        data-plot-left={left.toFixed(2)}
        data-plot-right={right.toFixed(2)}
        focusable="false"
      >
        {out}
      </svg>
    </div>
  );
}
