/**
 * The NEXT line on the console (spec §14.2): the key the facilitator is expected to press and why.
 * Pure, so every phase is unit-tested. It never reveals the hidden end round: from a reveal it says
 * "the next quarter" and notes that the final quarter ends the session.
 */
export type NextKey = 'F8' | 'F9' | null;

export interface NextInput {
  phase: 'lobby' | 'briefing' | 'open' | 'resolving' | 'reveal' | 'summit' | 'ended';
  round: number;
  paused: boolean;
  /** Firms with a decision (bots count) and the total number of firms. */
  committed: number;
  total: number;
  /** Resolution held in RESOLVING with nothing written (the retry state). */
  incomplete: boolean;
}

export interface NextLine {
  key: NextKey;
  text: string;
}

export function nextLine(i: NextInput): NextLine {
  const q = `quarter ${i.round}`;
  switch (i.phase) {
    case 'lobby':
      return { key: 'F9', text: i.total === 0 ? 'NEXT · Wait for firms to join, then press F9 for the briefing.' : `NEXT · F9 closes joining and opens the briefing (${i.total} firm${i.total === 1 ? '' : 's'}).` };
    case 'briefing':
      return { key: 'F9', text: 'NEXT · F9 opens quarter 1.' };
    case 'open':
      if (i.paused) return { key: null, text: 'NEXT · Resume the timer, then press F9 to resolve the quarter.' };
      return {
        key: 'F9',
        text: i.committed >= i.total ? `NEXT · F9 resolves ${q}. All ${i.total} firms have committed.` : `NEXT · F9 resolves ${q}. ${i.committed} of ${i.total} firms have committed; the rest take their defaults.`,
      };
    case 'resolving':
      return i.incomplete
        ? { key: null, text: 'NEXT · Press Retry resolution. Nothing was written.' }
        : { key: null, text: `NEXT · Wait. Resolving ${q}.` };
    case 'reveal':
      return { key: 'F9', text: `NEXT · F9 opens quarter ${i.round + 1}, or ends the session after the final quarter.` };
    case 'summit':
      return { key: 'F8', text: 'NEXT · F8 closes the summit and returns to the quarter.' };
    case 'ended':
      return { key: null, text: 'NEXT · Open RESULTS and step the panels with F9.' };
  }
}
