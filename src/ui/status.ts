/**
 * Status line under the projector top bar (spec §14.1, Session 12). Pure builders: one
 * sentence per phase, and during reveal a summary of the quarter from public data only.
 * ▲ and ▼ in the output are rendered as drawn glyphs by `StatusLine`.
 */
import { fmt, fmtClock, quarterLabel } from './format';

export type Phase = 'lobby' | 'briefing' | 'open' | 'resolving' | 'reveal' | 'summit' | 'ended';

export interface StatusInput {
  phase: Phase;
  round: number;
  paused: boolean;
  /** Time on the round clock, ms; null when no clock runs. Frozen value while paused. */
  leftMs: number | null;
  /** A moratorium is in force. */
  collapsed: boolean;
  /** Latest resolved quarter (0 before quarter 1). */
  resolved: number;
  /** Reveal summary; required in `reveal`. */
  reveal?: RevealInput;
}

export interface RevealInput {
  round: number;
  T: number;
  prevT: number;
  incidents: number;
  /** Tickers of the firms in 1st place now; more than one is a tie. */
  leaders: ReadonlyArray<string>;
  /** Tickers in 1st place before this quarter; empty before quarter 1. */
  prevLeaders: ReadonlyArray<string>;
  /** Quarter the moratorium began, or null. */
  collapseRound: number | null;
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: ReadonlyArray<string>): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "Q3 Y2 resolved · Trust ▼5.9 to 45.6 · BTC takes 1st · 2 incidents." */
export function revealHeadline(r: RevealInput): string {
  const parts = [`${quarterLabel(r.round)} resolved`];
  const d = r.T - r.prevT;
  const shown = Number(Math.abs(d).toFixed(1));
  parts.push(shown === 0 ? `Trust unchanged at ${fmt(r.T)}` : `Trust ${d > 0 ? '▲' : '▼'}${fmt(shown)} to ${fmt(r.T)}`);
  const leaders = [...r.leaders].sort();
  if (leaders.length > 1) {
    parts.push(`${joinNames(leaders)} tie for 1st`);
  } else if (leaders.length === 1) {
    const t = leaders[0] as string;
    const held = r.prevLeaders.length === 1 && r.prevLeaders[0] === t;
    parts.push(`${t} ${held ? 'holds' : 'takes'} 1st`);
  }
  parts.push(r.incidents === 0 ? 'No incidents' : plural(r.incidents, 'incident', 'incidents'));
  if (r.collapseRound !== null) parts.push(r.collapseRound === r.round ? 'Moratorium imposed' : 'Moratorium in force');
  return `${parts.join(' · ')}.`;
}

/** The sentence under the top bar for the current phase. */
export function statusSentence(s: StatusInput): string {
  const q = quarterLabel(s.round);
  const moratorium = s.collapsed ? ' Moratorium in force.' : '';
  switch (s.phase) {
    case 'lobby':
      return 'Lobby · Firms are forming. Scan the code or enter it at the address shown, then form or join a firm.';
    case 'briefing':
      return 'Briefing · Read the market rules. Quarter 1 opens when the facilitator advances.';
    case 'open':
      if (s.paused) {
        const at = s.leftMs !== null ? ` at ${fmtClock(s.leftMs)}` : '';
        return `${q} · Timer paused${at}. Decisions resume when the timer restarts.${moratorium}`;
      }
      if (s.leftMs !== null && s.leftMs <= 0) return `${q} · Time is up. Decisions are closed and the quarter resolves next.${moratorium}`;
      return `${q} · Decisions open. Set pace, safety and a card, then commit.${s.leftMs !== null ? ` ${fmtClock(s.leftMs)} left.` : ''}${moratorium}`;
    case 'resolving':
      return `${q} · Decisions closed. The quarter is resolving.`;
    case 'reveal':
      return s.reveal ? revealHeadline(s.reveal) : `${q} resolved.`;
    case 'summit':
      return `${q} · Industry summit in session. Propose, join or leave pacts now. Decisions resume after the summit.`;
    case 'ended':
      return `Session ended${s.resolved > 0 ? ` after ${plural(s.resolved, 'quarter', 'quarters')}` : ''}. Results follow on the results screen.`;
  }
}
