/** Results panel charts (spec §14.4): the final-board dumbbell and the attribution butterfly. Sized to their panel. */
import type { ReactElement } from 'react';
import { linearScale, niceDomain, niceTicks, tickDecimals } from '../../ui/chart';
import { CH, useChartSize } from '../../ui/components/useChartSize';
import { fmt, fmtShare } from '../../ui/format';
import type { ButterflyRow, DumbbellRow } from './model';

/** Vertical layout shared by both charts: a header row, the firm rows, an axis row and (optionally) a key row. */
function rowLayout(H: number, lh: number, n: number, key: boolean) {
  const top = lh * 1.4;
  const bottom = H - lh * (key ? 2.6 : 1.4);
  const rowH = Math.max(lh * 0.9, Math.min(lh * 2, (bottom - top) / Math.max(1, n)));
  return { top, rowH, axisY: top + rowH * n + lh * 0.7, keyY: top + rowH * n + lh * 1.9 };
}

/** Peak (hollow square) to final (solid square) per firm on one axis that includes zero. */
export function Dumbbell({ rows }: { rows: ReadonlyArray<DumbbellRow> }) {
  const [ref, { w: W, h: H, fs }] = useChartSize<HTMLDivElement>();
  const cw = fs * CH;
  const lh = fs * 1.35;
  const { top, rowH, axisY, keyY } = rowLayout(H, lh, rows.length, true);
  const plotL = cw * 12;
  const finalR = W - cw * 13;
  const plotR = finalR - cw * 12;
  const all = rows.flatMap((r) => [r.final, r.peak]);
  const { domain, step } = niceDomain(Math.min(0, ...all), Math.max(0, ...all), Math.max(2, Math.floor((plotR - plotL) / (cw * 9))));
  const ticks = niceTicks(domain, step);
  const dec = tickDecimals(ticks);
  const X = linearScale(domain, [plotL, plotR]);
  const sq = Math.max(4, Math.min(rowH * 0.5, fs * 0.7));
  const anyNeg = rows.some((r) => r.final < 0);
  const out: ReactElement[] = [];

  out.push(
    <text key="h1" x={0} y={lh / 2} dominantBaseline="central">#</text>,
    <text key="h2" x={cw * 4} y={lh / 2} dominantBaseline="central">FIRM</text>,
    <text key="h3" x={finalR} y={lh / 2} textAnchor="end" dominantBaseline="central">FINAL</text>,
    <text key="h4" x={W} y={lh / 2} textAnchor="end" dominantBaseline="central">FROM PEAK</text>,
  );
  ticks.forEach((t) => {
    const x = X(t);
    out.push(<line key={`g${t}`} className={t === 0 ? 'lc-zero' : 'lc-grid'} x1={x} x2={x} y1={top - lh * 0.3} y2={axisY - lh * 0.6} />);
    out.push(
      <text key={`gt${t}`} className={t === 0 ? 'lc-strong' : undefined} x={x} y={axisY} textAnchor="middle" dominantBaseline="central">
        {fmt(t, dec)}
      </text>,
    );
  });
  rows.forEach((r, i) => {
    const y = top + rowH * (i + 0.5);
    const neg = r.final < 0;
    const atPeak = r.fromPeak > -0.05;
    out.push(
      <g key={r.firmId} data-firm={r.ticker}>
        <text x={0} y={y} dominantBaseline="central">{r.rank}</text>
        <text className="lc-strong lc-name" x={cw * 4} y={y} dominantBaseline="central">{r.ticker}</text>
        <line className={`lc-row-line ${neg ? 'is-down' : 'is-signal'}`} x1={X(r.peak)} x2={X(r.final)} y1={y} y2={y} />
        <rect className="lc-pt-hollow" data-mark="peak" x={X(r.peak) - sq / 2} y={y - sq / 2} width={sq} height={sq} />
        <rect className={neg ? 'lc-f-down' : 'lc-f-signal'} data-mark="final" x={X(r.final) - sq * 0.6} y={y - sq * 0.6} width={sq * 1.2} height={sq * 1.2} />
        <text className={neg ? 'lc-t-down' : 'lc-strong'} x={finalR} y={y} textAnchor="end" dominantBaseline="central">{fmt(r.final)}</text>
        <text className={atPeak ? undefined : 'lc-t-down'} x={W} y={y} textAnchor="end" dominantBaseline="central">
          {atPeak ? 'at peak' : `▼${fmt(-r.fromPeak)}`}
        </text>
      </g>,
    );
  });
  const k = sq;
  let kx = plotL;
  const keyItem = (id: string, cls: string, label: string) => {
    out.push(<rect key={`k${id}`} className={cls} x={kx} y={keyY - k / 2} width={k} height={k} />);
    out.push(<text key={`kt${id}`} x={kx + k + cw} y={keyY} dominantBaseline="central">{label}</text>);
    kx += k + cw * (label.length + 3);
  };
  keyItem('p', 'lc-pt-hollow', 'PEAK');
  keyItem('f', 'lc-f-signal', 'FINAL');
  if (anyNeg) keyItem('n', 'lc-f-down', 'FINAL BELOW ZERO');

  return (
    <div ref={ref} className="lchart" style={{ flex: '1 1 0', minHeight: '8lh' }}>
      <svg className="lc" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" data-chart="dumbbell" aria-label={`Peak to final valuation for ${rows.length} firms, ranked by final valuation`} focusable="false">
        {out}
      </svg>
    </div>
  );
}

/** Share of damage to the left in red, share of value to the right in amber, ticker in the middle. */
export function Butterfly({ rows, anyPositive }: { rows: ReadonlyArray<ButterflyRow>; anyPositive: boolean }) {
  const [ref, { w: W, h: H, fs }] = useChartSize<HTMLDivElement>();
  const cw = fs * CH;
  const lh = fs * 1.35;
  const { top, rowH, axisY } = rowLayout(H, lh, rows.length, false);
  const mid = W / 2;
  const inner = cw * 4.5;
  const half = mid - inner - cw * 8;
  const maxShare = Math.max(0.01, ...rows.map((r) => r.damage), ...(anyPositive ? rows.map((r) => r.value) : []));
  const { domain, step } = niceDomain(0, maxShare, Math.max(2, Math.min(5, Math.floor(half / (cw * 7)))));
  const ticks = niceTicks(domain, step).filter((t) => t > 0);
  const S = linearScale(domain, [0, half]);
  const bh = Math.max(3, Math.min(rowH * 0.6, lh * 0.8));
  const regionMid = top + (rowH * rows.length) / 2;
  const out: ReactElement[] = [];

  out.push(
    <text key="hl" className="lc-t-down lc-name" x={mid - inner} y={lh / 2} textAnchor="end" dominantBaseline="central">SHARE OF DAMAGE</text>,
    <text key="hr" className="lc-t-signal lc-name" x={mid + inner} y={lh / 2} dominantBaseline="central">SHARE OF VALUE</text>,
  );
  ticks.forEach((t) => {
    const sides = anyPositive ? [mid - inner - S(t), mid + inner + S(t)] : [mid - inner - S(t)];
    sides.forEach((x, k) => {
      out.push(<line key={`g${t}-${k}`} className="lc-grid" x1={x} x2={x} y1={top - lh * 0.3} y2={axisY - lh * 0.6} />);
      out.push(
        <text key={`gt${t}-${k}`} x={x} y={axisY} textAnchor="middle" dominantBaseline="central">
          {`${fmt(t * 100, tickDecimals([t * 100]))}%`}
        </text>,
      );
    });
  });
  out.push(<line key="zl" className="lc-zero" x1={mid - inner} x2={mid - inner} y1={top - lh * 0.3} y2={axisY - lh * 0.6} />);
  out.push(<line key="zr" className="lc-zero" x1={mid + inner} x2={mid + inner} y1={top - lh * 0.3} y2={axisY - lh * 0.6} />);
  rows.forEach((r, i) => {
    const y = top + rowH * (i + 0.5);
    const dw = Math.max(1, S(r.damage));
    const vw = Math.max(1, S(r.value));
    out.push(
      <g key={r.firmId} data-firm={r.ticker}>
        <text className="lc-strong lc-name" x={mid} y={y} textAnchor="middle" dominantBaseline="central">{r.ticker}</text>
        <rect className="lc-f-down" data-mark="damage" x={mid - inner - dw} y={y - bh / 2} width={dw} height={bh} />
        <text className="lc-strong" x={mid - inner - dw - cw * 0.5} y={y} textAnchor="end" dominantBaseline="central">{fmtShare(r.damage)}</text>
        {anyPositive ? (
          <>
            <rect className="lc-f-signal" data-mark="value" x={mid + inner} y={y - bh / 2} width={vw} height={bh} />
            <text className="lc-strong" x={mid + inner + vw + cw * 0.5} y={y} dominantBaseline="central">{fmtShare(r.value)}</text>
          </>
        ) : null}
      </g>,
    );
  });
  if (!anyPositive) {
    out.push(
      <text key="none" className="lc-strong" data-note="no-positive" x={(mid + inner + W) / 2} y={regionMid} textAnchor="middle" dominantBaseline="central">
        No firm finished with positive value
      </text>,
    );
  }

  return (
    <div ref={ref} className="lchart" style={{ flex: '1 1 0', minHeight: '8lh' }}>
      <svg className="lc" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" data-chart="butterfly" aria-label={`Share of damage against share of value for ${rows.length} firms`} focusable="false">
        {out}
      </svg>
    </div>
  );
}
