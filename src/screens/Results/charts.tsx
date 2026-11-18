/** Results panel charts (spec §14.4): the attribution butterfly and the net contribution slope. Sized to their panel. */
import type { ReactElement } from 'react';
import { linearScale, niceDomain, niceTicks, tickDecimals } from '../../ui/chart';
import { CH, useChartSize } from '../../ui/components/useChartSize';
import { fmt, fmtShare } from '../../ui/format';
import type { ButterflyRow } from './model';

/**
 * Vertical layout shared by both charts: a header row, the firm rows, an axis row and (optionally) a key row.
 * Rows share the panel height (§14.4: every panel fills the projector); marks keep their own size caps.
 */
function rowLayout(H: number, lh: number, n: number, key: boolean) {
  const top = lh * 1.4;
  const bottom = H - lh * (key ? 2.6 : 1.4);
  const rowH = Math.max(lh * 0.9, (bottom - top) / Math.max(1, n));
  return { top, rowH, axisY: top + rowH * n + lh * 0.7, keyY: top + rowH * n + lh * 1.9 };
}

interface ButterflyProps {
  rows: ReadonlyArray<ButterflyRow>;
  anyPositive: boolean;
  /** Combined shares of the firms not listed (§14.4, above 24 firms): figures only, so the scale serves the listed firms. */
  others?: ButterflyRow | null;
}

/** Share of damage to the left in red, share of value to the right in amber, ticker in the middle. */
export function Butterfly({ rows, anyPositive, others = null }: ButterflyProps) {
  const [ref, { w: W, h: H, fs }] = useChartSize<HTMLDivElement>();
  const cw = fs * CH;
  const lh = fs * 1.35;
  const { top, rowH, axisY: rowsEnd } = rowLayout(H, lh, rows.length + (others ? 1 : 0), false);
  const axisY = others ? rowsEnd - rowH : rowsEnd;
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
  if (others) {
    const y = axisY + lh * 0.7 + rowH * 0.5;
    out.push(
      <g key="others" data-firm={others.ticker} data-others="">
        <line className="lc-grid" x1={0} x2={W} y1={axisY + lh * 0.6} y2={axisY + lh * 0.6} />
        <text className="lc-strong lc-name" x={mid} y={y} textAnchor="middle" dominantBaseline="central">{others.ticker}</text>
        <text className="lc-t-down" x={mid - inner} y={y} textAnchor="end" dominantBaseline="central">{fmtShare(others.damage)}</text>
        {anyPositive ? (
          <text className="lc-t-signal" x={mid + inner} y={y} dominantBaseline="central">{fmtShare(others.value)}</text>
        ) : null}
      </g>,
    );
  }
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

interface SlopeProps {
  rows: ReadonlyArray<{ firmId: string; ticker: string; valuationRank: number; rank: number; move: number; highlight: 'up' | 'down' | null }>;
  /** Mark the firm ranked 1st by net contribution in signal, labelled "top net contribution" (Session 20). */
  winner?: boolean;
}

/**
 * NET CONTRIBUTION slope chart (§14.4 panel 3; Session 18, full width since Session 20): rank by final valuation on the left, rank by net
 * contribution on the right. Firms that moved 3 places or more are drawn thick, ▲ in up and ▼ in down; the rest dim.
 */
export function Slope({ rows, winner = false }: SlopeProps) {
  const [ref, { w: W, h: H, fs }] = useChartSize<HTMLDivElement>();
  const cw = fs * CH;
  const lh = fs * 1.35;
  const n = Math.max(1, rows.length);
  const top = lh * 1.6;
  const bottom = H - lh * 0.6;
  const rowH = (bottom - top) / n;
  const y = (rank: number): number => top + rowH * (rank - 0.5);
  const xL = cw * 11;
  // Room right of the NET axis for "1 ARCN ▲7", or with the winner note "1 ARCN ▲7 · top net contribution".
  const xR = W - cw * (winner ? 36 : 15);
  // Labels never overlap: each side places the leader first, then the largest moves, then the rest by rank, and skips
  // a label that would come within a line of one already placed.
  const place = (rankOf: (r: SlopeProps['rows'][number]) => number): Set<string> => {
    const order = [...rows].sort(
      (a, b) =>
        (rankOf(a) === 1 ? 0 : 1) - (rankOf(b) === 1 ? 0 : 1) ||
        (b.highlight ? 1 : 0) - (a.highlight ? 1 : 0) ||
        Math.abs(b.move) - Math.abs(a.move) ||
        rankOf(a) - rankOf(b),
    );
    const taken: number[] = [];
    const out = new Set<string>();
    for (const r of order) {
      const yy = y(rankOf(r));
      if (taken.every((t) => Math.abs(t - yy) >= lh * 0.95)) {
        taken.push(yy);
        out.add(r.firmId);
      }
    }
    return out;
  };
  const left = place((r) => r.valuationRank);
  const right = place((r) => r.rank);
  const isWin = (r: SlopeProps['rows'][number]): boolean => winner && r.rank === 1;
  const ordered = [...rows].sort((a, b) => (isWin(a) ? 2 : a.highlight ? 1 : 0) - (isWin(b) ? 2 : b.highlight ? 1 : 0));
  return (
    <div ref={ref} className="lchart" style={{ flex: '1 1 0', minHeight: '8lh' }}>
      <svg
        className="lc"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        data-chart="slope"
        aria-label={`Rank by final valuation against rank by net contribution for ${rows.length} firms`}
        focusable="false"
      >
        <text x={xL} y={lh / 2} textAnchor="middle" dominantBaseline="central">VALUATION</text>
        <text x={xR} y={lh / 2} textAnchor="middle" dominantBaseline="central">NET</text>
        <line className="lc-grid" x1={xL} x2={xL} y1={top - lh * 0.3} y2={bottom} />
        <line className="lc-grid" x1={xR} x2={xR} y1={top - lh * 0.3} y2={bottom} />
        {ordered.map((r) => {
          const win = isWin(r);
          const cls = win ? 'sl-win' : r.highlight === 'up' ? 'sl-up' : r.highlight === 'down' ? 'sl-down' : 'sl-dim';
          const tone = win ? 'lc-t-signal' : r.highlight === 'up' ? 'lc-t-up' : r.highlight === 'down' ? 'lc-t-down' : 'lc-t-dim';
          const moved = r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : '';
          const sign = win || r.highlight ? moved : '';
          const note = win ? ' · top net contribution' : '';
          return (
            <g key={r.firmId} data-firm={r.ticker} data-move={r.move} data-highlight={r.highlight ?? ''} data-winner={win ? '' : undefined}>
              <line className={`sl-line ${cls}`} x1={xL} x2={xR} y1={y(r.valuationRank)} y2={y(r.rank)} />
              <rect className={win ? 'lc-f-signal' : r.highlight === 'up' ? 'lc-f-up' : r.highlight === 'down' ? 'lc-f-down' : 'lc-f-dim'} x={xR - 3} y={y(r.rank) - 3} width={6} height={6} />
              {left.has(r.firmId) ? (
                <text className={win ? 'lc-t-signal lc-name' : r.highlight ? 'lc-strong lc-name' : tone} x={xL - cw} y={y(r.valuationRank)} textAnchor="end" dominantBaseline="central" data-label="valuation">
                  {`${r.valuationRank} ${r.ticker}`}
                </text>
              ) : null}
              {right.has(r.firmId) ? (
                <text className={win || r.highlight ? `${tone} lc-name` : tone} x={xR + cw} y={y(r.rank)} dominantBaseline="central" data-label="net">
                  {`${r.rank} ${r.ticker}${sign ? ` ${sign}` : ''}${note}`}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
