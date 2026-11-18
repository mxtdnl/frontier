/**
 * Phase transitions of the `public` node (spec §4), as pure functions. Each step takes the
 * current node and returns the next one, or a plain-English reason for refusing. The
 * orchestrator runs them inside a database transaction, so every transition is atomic and
 * a second facilitator window that arrives late is refused rather than applied twice.
 */
import type { PublicNode } from './schema';

/** A step returns the next node, or the reason it cannot run. */
export type Step = (p: PublicNode) => PublicNode | string;

/** Late decisions are accepted by the rules until deadline + 3000 ms (spec §13). */
export const GRACE_MS = 3000;
/** Auto-resolve waits for the grace window to close, so no accepted decision is missed. */
export const AUTO_RESOLVE_DELAY_MS = GRACE_MS + 250;

const refuse = (p: PublicNode, what: string): string => `Cannot ${what} while the session is in phase ${p.phase.toUpperCase()}.`;

export const toBriefing: Step = (p) => {
  if (p.phase !== 'lobby') return refuse(p, 'open the briefing');
  return { ...p, phase: 'briefing', joinLocked: true };
};

/**
 * Danger panel (spec §14.2): locks or reopens joining during the lobby. The briefing always
 * locks it; it never reopens after that.
 */
export const setJoinLock =
  (locked: boolean): Step =>
  (p) => {
    if (p.phase !== 'lobby') return refuse(p, locked ? 'lock joining' : 'reopen joining');
    return { ...p, joinLocked: locked };
  };

/** Opens round 1 from the briefing, or round n + 1 from a reveal. */
export const toOpen =
  (round: number, now: number, timerMs: number): Step =>
  (p) => {
    const fromBriefing = p.phase === 'briefing' && round === 1;
    const fromReveal = p.phase === 'reveal' && round === p.round + 1;
    if (!fromBriefing && !fromReveal) return refuse(p, `open quarter ${round}`);
    return {
      ...p,
      phase: 'open',
      round,
      deadline: now + timerMs,
      paused: false,
      pausedRemainingMs: null,
      resumePhase: null,
      resolvingBy: null,
    };
  };

/** Step 1 of §11: only an open quarter whose number matches can be locked for resolution. */
export const lockForResolve =
  (round: number, holder: string): Step =>
  (p) => {
    if (p.phase !== 'open') return p.phase === 'resolving' ? 'This quarter is already being resolved.' : refuse(p, 'resolve a quarter');
    if (p.round !== round) return `The session is on quarter ${p.round}, not quarter ${round}. Check the screen and try again.`;
    return { ...p, phase: 'resolving', resolvingBy: holder };
  };

/** Takes over a stuck resolution. Only the holder the caller saw may be replaced. */
export const claimRetry =
  (seenHolder: string | null, holder: string): Step =>
  (p) => {
    if (p.phase !== 'resolving') return 'The quarter is no longer waiting for resolution. Check the screen.';
    if (p.resolvingBy !== seenHolder) return 'Another window is already retrying this quarter. Wait a few seconds and check the screen.';
    return { ...p, resolvingBy: holder };
  };

/** Closes a resolved quarter or ends the session from the allowed phases. */
export const toEnded =
  (now: number): Step =>
  (p) => {
    if (p.phase === 'ended') return 'The session has already ended.';
    if (p.phase === 'lobby' || p.phase === 'briefing') return 'Nothing to end yet. The first quarter has not opened.';
    if (p.phase === 'resolving') return 'A quarter is being resolved. Wait for the reveal, then end the session.';
    return { ...p, phase: 'ended', deadline: null, paused: false, pausedRemainingMs: null, resumePhase: null, resolvingBy: null, endedAt: now };
  };

const remaining = (p: PublicNode, now: number): number => (p.paused ? (p.pausedRemainingMs ?? 0) : Math.max(0, (p.deadline ?? now) - now));

/** Summit from `open` freezes the timer; from `reveal` there is no timer to freeze. */
export const enterSummit =
  (now: number): Step =>
  (p) => {
    if (p.phase !== 'open' && p.phase !== 'reveal') return refuse(p, 'enter the summit');
    if (p.phase === 'reveal') return { ...p, phase: 'summit', resumePhase: 'reveal' };
    return { ...p, phase: 'summit', resumePhase: 'open', paused: true, pausedRemainingMs: remaining(p, now), deadline: null };
  };

/** Returns to the phase the summit interrupted; an interrupted timer restarts with the time it had. */
export const exitSummit =
  (now: number): Step =>
  (p) => {
    if (p.phase !== 'summit' || p.resumePhase === null) return 'The summit is not in session.';
    if (p.resumePhase === 'reveal') return { ...p, phase: 'reveal', resumePhase: null };
    return {
      ...p,
      phase: 'open',
      resumePhase: null,
      paused: false,
      deadline: now + (p.pausedRemainingMs ?? 0),
      pausedRemainingMs: null,
    };
  };

/** Adds or removes time on an open or paused round timer. Never moves a deadline before now. */
export const adjustTimer =
  (deltaMs: number, now: number): Step =>
  (p) => {
    if (p.phase !== 'open') return 'The timer can be changed only while a quarter is open.';
    if (p.paused) return { ...p, pausedRemainingMs: Math.max(0, (p.pausedRemainingMs ?? 0) + deltaMs) };
    return { ...p, deadline: Math.max(now, (p.deadline ?? now) + deltaMs) };
  };

/**
 * Pausing stops the clock and removes the deadline, so the rules refuse decisions until the
 * timer resumes (a missing deadline always denies a write; spec §13).
 */
export const pauseTimer =
  (now: number): Step =>
  (p) => {
    if (p.phase !== 'open') return 'The timer can be paused only while a quarter is open.';
    if (p.paused) return 'The timer is already paused.';
    return { ...p, paused: true, pausedRemainingMs: remaining(p, now), deadline: null };
  };

export const resumeTimer =
  (now: number): Step =>
  (p) => {
    if (p.phase !== 'open' || !p.paused) return 'The timer is not paused.';
    return { ...p, paused: false, deadline: now + (p.pausedRemainingMs ?? 0), pausedRemainingMs: null };
  };

/** Whole milliseconds on the clock for display: the frozen value while paused or in a summit. */
export function displayRemainingMs(p: PublicNode, serverNow: number): number | null {
  if (p.phase === 'summit' || p.paused) return p.pausedRemainingMs;
  return p.deadline === null ? null : Math.max(0, p.deadline - serverNow);
}

/** F7: disclosure may be toggled in any phase until the session ends (spec §9.3). */
export const toggleDisclosureStep: Step = (p) => {
  if (p.phase === 'ended') return 'The session has ended. Disclosure can no longer change.';
  return { ...p, disclosure: !p.disclosure };
};

/** Number of results panels (spec §14.4). `revealStep` is the zero-based index of the panel on screen. */
export const RESULT_PANEL_COUNT = 6;

/** F9 steps the results forward and Esc steps back, once the session has ended. */
export const stepResultsStep =
  (delta: 1 | -1): Step =>
  (p) => {
    if (p.phase !== 'ended') return 'The results screen is available after the session ends.';
    const next = p.revealStep + delta;
    if (next >= RESULT_PANEL_COUNT) return 'This is the last results panel.';
    if (next < 0) return 'This is the first results panel.';
    return { ...p, revealStep: next };
  };
