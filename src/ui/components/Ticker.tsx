import { Fragment } from 'react';
import { quarterLabel } from '../format';
import { useReducedMotion } from '../useReducedMotion';
import { GlyphDown } from './Glyph';

export type TickerTone = 'wire' | 'down' | 'up';

export interface TickerItem {
  text: string;
  /** Quarter the headline belongs to; 0 before quarter 1. */
  round: number;
  /** `down` items carry ▼ (incidents, breaches); colour is never the only cue. */
  tone: TickerTone;
}

interface Props {
  /** Newest first. Plain strings are shown without a quarter, in the wire colour. */
  items: ReadonlyArray<TickerItem | string>;
}

const asItem = (i: TickerItem | string): TickerItem | { text: string; round: null; tone: TickerTone } =>
  typeof i === 'string' ? { text: i, round: null, tone: 'wire' } : i;

function Item({ item }: { item: TickerItem | string }) {
  const it = asItem(item);
  return (
    <>
      {it.round !== null ? <span className="ticker-q">{it.round > 0 ? quarterLabel(it.round) : 'PRE'}</span> : null}
      <span className={`ticker-t t-${it.tone}`}>
        {it.tone === 'down' ? (
          <>
            <span className="sr-only">alert </span>
            <GlyphDown />{' '}
          </>
        ) : null}
        {it.text}
      </span>
    </>
  );
}

const keyOf = (i: TickerItem | string, n: number): string => `${n}-${typeof i === 'string' ? i : i.text}`;

export function Ticker({ items }: Props) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <div className="ticker" aria-label="Wire">
        <span className="ticker-label">WIRE</span>
        <ul className="ticker-static">
          {items.slice(0, 3).map((t, n) => (
            <li key={keyOf(t, n)}>
              <Item item={t} />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const length = items.reduce<number>((a, i) => a + asItem(i).text.length + 12, 0);
  const run = (copy: number) =>
    items.map((t, n) => (
      <Fragment key={`${copy}-${keyOf(t, n)}`}>
        <Item item={t} />
        <span className="ticker-sep" aria-hidden="true">·</span>
      </Fragment>
    ));
  return (
    <div className="ticker" aria-label="Wire">
      <span className="ticker-label">WIRE</span>
      <div className="ticker-window">
        <span className="ticker-run" style={{ ['--ticker-duration' as string]: `${Math.max(30, length * 0.25)}s` }}>
          <span className="ticker-copy">{run(0)}</span>
          <span className="ticker-copy" aria-hidden="true">{run(1)}</span>
        </span>
      </div>
    </div>
  );
}
