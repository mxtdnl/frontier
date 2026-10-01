const MINUS = '−';

/** Fixed-decimal number with a true minus sign. */
export function fmt(n: number, digits = 1): string {
  const s = Math.abs(n).toFixed(digits);
  return n < 0 && Number(s) !== 0 ? MINUS + s : s;
}

/** Signed number: always carries + or −, zero carries neither. */
export function fmtSigned(n: number, digits = 1): string {
  const s = fmt(n, digits);
  if (Number(Math.abs(n).toFixed(digits)) === 0) return s;
  return n > 0 ? '+' + s : s;
}

/** Share as a percentage with one decimal, e.g. 0.214 -> "21.4%". */
export function fmtShare(share: number): string {
  return fmt(share * 100, 1) + '%';
}

/** Whole number with thousands separators. */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Round n -> "Q3 Y2" (spec §4). */
export function quarterLabel(round: number): string {
  const q = ((round - 1) % 4) + 1;
  const y = Math.ceil(round / 4);
  return `Q${q} Y${y}`;
}

/** Milliseconds -> "MM:SS", clamped at zero. */
export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Local wall-clock time as HH:MM:SS. */
export function fmtTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
