/**
 * Where one quarter's trust change came from (spec §6.3 steps 6–7; QUARTER BRIEF on `#/wire`, §14.2, Session 19).
 * Pure: rebuilt from the stored history and the previous quarter's T (T0 before quarter 1), with no replay.
 *
 * The terms sum to the stored dT:
 *   recovery + draw + incidents + publish + lobby + clamp + moratorium = dT (to rounding, well under 1e-9).
 * Facilitator only: the firm lists name who drew, had incidents and played PUBLISH or LOBBY, private while disclosure
 * is off.
 */
import { PARAMS, type Params } from './params';
import type { RoundRecord } from './types';

export interface TrustBreakdown {
  round: number;
  /** T at the start of the quarter: the previous quarter's T, or T0 before quarter 1. */
  from: number;
  /** T after the quarter, as stored. */
  to: number;
  /** The stored dT. */
  dT: number;
  /** R_eff × T × (1 − T/100), with R_eff as at the start of the quarter (reduced after a moratorium). */
  recovery: number;
  /** −Σ draw (each firm's d_i × 8/N). */
  draw: number;
  /** −INC_TRUST × 8/N per incident. */
  incidents: number;
  /** +PUBLISH_TRUST × 8/N per PUBLISH card. */
  publish: number;
  /** −LOBBY_TRUST per LOBBY card. */
  lobby: number;
  /** What clamping T to [0, 100] added (positive at the floor) or removed (negative at the ceiling); 0 when unclamped. */
  clamp: number;
  /** The one-off drop in the moratorium quarter: −BACKLASH, or less when T was already below BACKLASH. 0 otherwise. */
  moratorium: number;
  /** True in the quarter the moratorium began. */
  moratoriumNow: boolean;
  /** Firm ids, in the order of the history record. */
  incidentFirms: string[];
  publishFirms: string[];
  lobbyFirms: string[];
}

/** The terms of `round`'s trust change, or null when the history has no record for it. */
export function trustBreakdown(history: ReadonlyArray<RoundRecord>, round: number, p: Params = PARAMS): TrustBreakdown | null {
  const rec = history.find((h) => h.round === round);
  if (!rec) return null;
  const prev = round > 1 ? history.find((h) => h.round === round - 1) : undefined;
  if (round > 1 && !prev) return null;
  const from = prev ? prev.T : p.T0;
  const wasCollapsed = prev?.collapsed ?? false;
  const ids = Object.keys(rec.firms);
  const n = ids.length;
  const scale = n > 0 ? p.DRAW_REF_N / n : 0;

  const rEff = wasCollapsed ? p.R * p.MORATORIUM_R : p.R;
  const recovery = rEff * from * (1 - from / p.TRUST_MAX);
  let drawSum = 0;
  const incidentFirms: string[] = [];
  const publishFirms: string[] = [];
  const lobbyFirms: string[] = [];
  for (const id of ids) {
    const f = rec.firms[id];
    if (!f) continue;
    drawSum += f.draw;
    if (f.incident) incidentFirms.push(id);
    if (f.card === 'PUBLISH') publishFirms.push(id);
    if (f.card === 'LOBBY') lobbyFirms.push(id);
  }
  const draw = -drawSum;
  const incidents = -incidentFirms.length * p.INC_TRUST * scale;
  const publish = publishFirms.length * p.PUBLISH_TRUST * scale;
  const lobby = -lobbyFirms.length * p.LOBBY_TRUST;

  const raw = from + recovery + draw + incidents + publish + lobby;
  const clamped = Math.min(p.TRUST_MAX, Math.max(0, raw));
  const clamp = clamped - raw;
  const moratoriumNow = rec.collapsed && !wasCollapsed;
  const moratorium = moratoriumNow ? Math.max(0, clamped - p.BACKLASH) - clamped : 0;

  return {
    round,
    from,
    to: rec.T,
    dT: rec.dT,
    recovery,
    draw,
    incidents,
    publish,
    lobby,
    clamp: Math.abs(clamp) < 1e-12 ? 0 : clamp,
    moratorium,
    moratoriumNow,
    incidentFirms,
    publishFirms,
    lobbyFirms,
  };
}

/** Sum of the terms; equals `dT` to rounding. */
export const breakdownSum = (b: TrustBreakdown): number => b.recovery + b.draw + b.incidents + b.publish + b.lobby + b.clamp + b.moratorium;
