import type { ReactNode } from 'react';

/** Dark top bar with a 2 px amber rule (spec §14.1). Children sit left to right; `.tb-push` moves the rest right. */
export function TopBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <header className={`topbar ${className}`}>{children}</header>;
}

/** The brand block: the one solid amber mark in the bar. */
export function Brand({ text = 'FRONTIER' }: { text?: string }) {
  return <span className="tb-brand">{text}</span>;
}

export type PhaseKind = 'lobby' | 'briefing' | 'open' | 'resolving' | 'reveal' | 'summit' | 'ended';

/** Phase as a status block: each phase distinct, always with its word (spec §16.1). */
export function PhaseBlock({ kind, word }: { kind: PhaseKind; word: string }) {
  return (
    <span className={`phase phase-${kind}`} data-phase={kind}>
      {word}
    </span>
  );
}
