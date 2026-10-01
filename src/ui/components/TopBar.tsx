import type { ReactNode } from 'react';

/** Signal-amber bar with black text. Children are placed left to right with a 2ch gap. */
export function TopBar({ children }: { children: ReactNode }) {
  return <header className="topbar">{children}</header>;
}
