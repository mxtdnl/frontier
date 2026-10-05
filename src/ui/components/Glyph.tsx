/** Triangles and check mark drawn as shapes: the typeface does not carry them. */
export function GlyphUp() {
  return <span className="glyph glyph-up" aria-hidden="true" />;
}
export function GlyphDown() {
  return <span className="glyph glyph-down" aria-hidden="true" />;
}
export function GlyphCheck() {
  return <span className="glyph glyph-check" aria-hidden="true" />;
}

/** ≤, ≥ and → drawn as strokes: the typeface carries none of them (Session 1). */
function Stroke({ d, label }: { d: string; label: string }) {
  return (
    <svg className="glyph-s" viewBox="0 0 10 10" aria-label={label} role="img" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="butt" strokeLinejoin="miter" />
    </svg>
  );
}
export function GlyphLe() {
  return <Stroke d="M8 1.5 L2 5 L8 8.5 M2 9.5 H8" label="at most" />;
}
export function GlyphGe() {
  return <Stroke d="M2 1.5 L8 5 L2 8.5 M2 9.5 H8" label="at least" />;
}
export function GlyphArrow() {
  return <Stroke d="M0.5 5 H9 M6 2 L9 5 L6 8" label="then" />;
}
