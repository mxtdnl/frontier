import { barSpan, segmentLabel, type ShareSegment } from '../performance';
import { linearScale, linePath, xPositions } from '../chart';
import { GlyphCheck, GlyphDown, GlyphUp } from './Glyph';

/** Board value share strip (spec §14.1, Session 13): firms above zero, faded by rank, labelled where they fit. */
export function ShareStrip({ segments, below, trackCh }: { segments: ReadonlyArray<ShareSegment>; below: number; trackCh: number }) {
  const caption = below > 0 ? `${below} below zero` : '';
  const described = segments.map((s) => `${s.ticker} ${Math.round(s.share * 100)}%`).join(', ');
  return (
    <div
      className="share-strip"
      data-share-strip=""
      data-below={below}
      role="img"
      aria-label={`Market value share: ${described || 'no firm above zero'}${caption ? `; ${caption}` : ''}.`}
    >
      <span className="ss-label">VALUE SHARE</span>
      <div className="ss-track">
        {segments.length === 0 ? (
          <span className="ss-none">No firm above zero</span>
        ) : (
          segments.map((s) => {
            const label = segmentLabel(s, trackCh);
            return (
              <span key={s.id} className={`ss-seg ss-l${s.fade}`} style={{ width: `${(s.share * 100).toFixed(3)}%` }} data-seg={s.ticker} data-share={s.share.toFixed(4)}>
                {label ? <span className="ss-text">{label}</span> : null}
              </span>
            );
          })
        )}
      </div>
      {caption ? <span className="ss-cap">{caption}</span> : null}
    </div>
  );
}

/** A firm's valuation as a bar from a visible zero line on a scale shared by every row. */
export function ValueBar({ value, domain }: { value: number; domain: readonly [number, number] }) {
  const { zero, start, width } = barSpan(value, domain);
  const pct = (f: number) => `${(f * 100).toFixed(2)}%`;
  return (
    <span className="vbar" data-value-bar={value < 0 ? 'neg' : 'pos'} aria-hidden="true">
      <span className={`vbar-fill ${value < 0 ? 'neg' : 'pos'}`} style={{ left: pct(start), width: pct(width) }} />
      <span className="vbar-zero" style={{ left: pct(zero) }} />
    </span>
  );
}

/** The last quarters of a firm's valuation as a thin line on a y-scale shared by every row; dim zero line. */
export function TrendLine({ values, domain }: { values: ReadonlyArray<number>; domain: readonly [number, number] }) {
  if (values.length < 2) return <span className="trend-empty" aria-hidden="true" />;
  const W = 100;
  const H = 20;
  const Y = linearScale(domain, [H - 2, 2]);
  const X = xPositions(values.length, 1, W - 1);
  const last = values[values.length - 1] as number;
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false" data-trend={values.length}>
      <line className="trend-zero" x1={0} x2={W} y1={Y(0)} y2={Y(0)} vectorEffect="non-scaling-stroke" />
      <path className={`trend-line ${last < 0 ? 'neg' : ''}`} d={linePath(values, X, Y)} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Commit mark: a solid green box with a check when the firm has committed this quarter, a dim dash otherwise. */
export function CommitMark({ committed }: { committed: boolean }) {
  if (!committed) return <span className="dim" aria-label="not committed">{'–'}</span>;
  return (
    <span className="cmt-box" data-committed="">
      <span className="sr-only">committed</span>
      <GlyphCheck />
    </span>
  );
}

/** Places moved since last quarter: ▲ or ▼ with the number; a dim dash for none. */
export function RankMove({ move }: { move: number }) {
  if (move === 0) return <span className="dim">{'–'}</span>;
  const up = move > 0;
  return (
    <span className={`delta ${up ? 'pos' : 'neg'}`} data-move={move}>
      <span className="sr-only">{up ? 'up ' : 'down '}</span>
      {up ? <GlyphUp /> : <GlyphDown />}
      {Math.abs(move)}
    </span>
  );
}
