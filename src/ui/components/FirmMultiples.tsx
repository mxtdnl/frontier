import { linearScale, linePath, xPositions } from '../chart';
import { fmt } from '../format';
import { Delta } from './Delta';
import { useChartSize } from './useChartSize';

export interface FirmCard {
  id: string;
  ticker: string;
  rank: number;
  value: number;
  change: number;
  /** Valuation by quarter from the opening value. */
  history: ReadonlyArray<number>;
}

interface Props {
  cards: ReadonlyArray<FirmCard>;
  cols: number;
  rows: number;
  /** One y domain and gridline values for every card (spec §14.1 `FIRMS`). */
  domain: readonly [number, number];
  ticks: ReadonlyArray<number>;
}

/** Small multiples (spec §14.1 `FIRMS`, Session 13): one card per firm, every card on the same y-scale. */
export function FirmMultiples({ cards, cols, rows, domain, ticks }: Props) {
  return (
    <div className="fm-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }} data-firms-grid={`${cols}x${rows}`}>
      {cards.map((c) => (
        <div key={c.id} className="fm-card" data-firm={c.ticker}>
          <div className="fm-head">
            <span>
              <span className="dim">{c.rank}</span> <span className="fm-ticker">{c.ticker}</span>
            </span>
            <span>
              <span className={c.value < 0 ? 'neg-c' : undefined}>{fmt(c.value)}</span> <Delta value={c.change} />
            </span>
          </div>
          <CardChart card={c} domain={domain} ticks={ticks} />
        </div>
      ))}
    </div>
  );
}

function CardChart({ card, domain, ticks }: { card: FirmCard; domain: readonly [number, number]; ticks: ReadonlyArray<number> }) {
  const [ref, size] = useChartSize<HTMLDivElement>();
  const values = card.history;
  if (values.length < 2) {
    return (
      <div ref={ref} className="fm-chart lchart-empty">
        <span>No quarter resolved yet</span>
      </div>
    );
  }
  const { w: W, h: H, fs } = size;
  const pad = fs * 0.5;
  const left = fs * 0.4;
  const right = W - fs * 0.8;
  const Y = linearScale(domain, [H - pad, pad]);
  const X = xPositions(values.length, left, right);
  const last = values.length - 1;
  const neg = (values[last] as number) < 0;
  let peak = 0;
  values.forEach((v, i) => {
    if (v > (values[peak] as number)) peak = i;
  });
  const sq = Math.max(4, fs * 0.5);
  return (
    <div ref={ref} className="fm-chart">
      <svg
        className="lc"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${card.ticker} valuation by quarter, from ${fmt(values[0] as number)} to ${fmt(values[last] as number)}, peak ${fmt(values[peak] as number)}`}
        data-chart="multiple"
        data-plot-left={left.toFixed(2)}
        data-plot-right={right.toFixed(2)}
        focusable="false"
      >
        {ticks.filter((t) => t !== 0).map((t) => (
          <line key={t} className="lc-grid" x1={left} x2={right} y1={Y(t)} y2={Y(t)} />
        ))}
        <line className="fm-zero" x1={left} x2={right} y1={Y(0)} y2={Y(0)} />
        <path className={`lc-line ${neg ? 'lc-s-down' : 'lc-s-wire'}`} d={linePath(values, X, Y)} />
        {peak !== last ? <rect className="lc-pt-hollow" data-peak="" x={X(peak) - sq / 2} y={Y(values[peak] as number) - sq / 2} width={sq} height={sq} /> : null}
        <rect className={neg ? 'lc-f-down' : 'lc-f-wire'} x={X(last) - sq * 0.7} y={Y(values[last] as number) - sq * 0.7} width={sq * 1.4} height={sq * 1.4} />
      </svg>
    </div>
  );
}
