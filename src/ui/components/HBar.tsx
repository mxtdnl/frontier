import { linearScale, type Domain } from '../chart';

interface Props {
  label: string;
  /** Signed value in the units of `domain`. */
  value: number;
  /** Axis range; it is widened to include 0. Defaults to 0–1. */
  domain?: Domain;
  text: string;
  /** Tone for positive values; negative values are always drawn in the down colour. */
  /** `signal-outline` is the amber series drawn as an outline, not a fill (amber budget, spec §16.1). */
  tone?: 'wire' | 'signal' | 'signal-outline' | 'dim' | 'down';
  /** Optional marker, in the units of `domain`. */
  marker?: number;
  markerTone?: 'text' | 'wire';
  labelW?: number;
  textW?: number;
  describe?: string;
}

/** Horizontal bar drawn from a visible zero line (spec §16.3). Negative values extend left in the down colour. */
export function HBar({ label, value, domain = [0, 1], text, tone = 'wire', marker, markerTone = 'text', labelW = 8, textW = 10, describe }: Props) {
  const lo = Math.min(0, domain[0]);
  const hi = Math.max(0, domain[1]);
  const at = linearScale([lo, hi], [0, 100]);
  const clamp = (v: number) => Math.min(100, Math.max(0, at(Math.min(hi, Math.max(lo, v)))));
  const zero = clamp(0);
  const end = clamp(value);
  const neg = value < 0;
  return (
    <div
      className="hbar"
      style={{ ['--hbar-label' as string]: `${labelW}ch`, ['--hbar-text' as string]: `${textW}ch` }}
      role="img"
      aria-label={describe ?? `${label} ${text}`}
    >
      <span>{label}</span>
      <span className="hbar-track">
        <span
          className={`hbar-fill t-${neg ? 'down' : tone}`}
          style={{ left: `${Math.min(zero, end).toFixed(2)}%`, width: `${Math.abs(end - zero).toFixed(2)}%` }}
          data-neg={neg ? '' : undefined}
        />
        <span className="hbar-zero" style={{ left: `${zero.toFixed(2)}%` }} />
        {marker !== undefined ? <span className={`hbar-marker m-${markerTone}`} style={{ left: `${clamp(marker).toFixed(2)}%` }} /> : null}
      </span>
      <span className={`hbar-text${neg ? ' neg' : ''}`}>{text}</span>
    </div>
  );
}
