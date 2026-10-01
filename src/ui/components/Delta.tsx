import { fmt } from '../format';
import { GlyphDown, GlyphUp } from './Glyph';

interface Props {
  value: number;
  digits?: number;
  suffix?: string;
  /** Roll target for the reveal sequence. */
  prev?: string;
}

/** Signed change: glyph, sign and colour together; colour is never the only cue. */
export function Delta({ value, digits = 1, suffix = '', prev }: Props) {
  const rounded = Number(Math.abs(value).toFixed(digits));
  if (rounded === 0) {
    return (
      <span className="delta zero">
        <span data-roll={prev !== undefined ? '' : undefined} data-prev={prev}>
          {fmt(0, digits) + suffix}
        </span>
      </span>
    );
  }
  const pos = value > 0;
  const sr = pos ? 'up ' : 'down ';
  return (
    <span className={`delta ${pos ? 'pos' : 'neg'}`}>
      <span className="sr-only">{sr}</span>
      {pos ? <GlyphUp /> : <GlyphDown />}
      <span data-roll={prev !== undefined ? '' : undefined} data-prev={prev}>
        {fmt(Math.abs(value), digits) + suffix}
      </span>
    </span>
  );
}
