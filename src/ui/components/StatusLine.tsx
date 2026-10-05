import { Fragment } from 'react';
import { GlyphDown, GlyphUp } from './Glyph';

/**
 * Renders a status sentence (src/ui/status.ts). A ▲ or ▼ with the figure after it becomes a
 * drawn glyph in the up or down colour, so the change carries a sign and a colour together.
 */
export function GlyphText({ text }: { text: string }) {
  const parts = text.split(/([▲▼][^\s·.]*(?:\.\d+)?)/);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('▲') || p.startsWith('▼')) {
          const up = p.startsWith('▲');
          return (
            <span key={i} className={`delta ${up ? 'pos' : 'neg'}`}>
              <span className="sr-only">{up ? 'up ' : 'down '}</span>
              {up ? <GlyphUp /> : <GlyphDown />}
              {p.slice(1)}
            </span>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** One sentence under the projector top bar (spec §14.1). */
export function StatusLine({ text }: { text: string }) {
  return (
    <p className="status-line" data-status-line="">
      <GlyphText text={text} />
    </p>
  );
}
