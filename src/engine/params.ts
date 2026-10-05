/**
 * Every tunable number in the engine (spec §5.2, §6.2, §7, §9). Nothing else in the
 * codebase may hard-code these values. Change them only through the calibration
 * process (spec §8.3) and log each change in docs/CALIBRATION.md.
 */
import type { Card } from './types';

export type ByPace = readonly [number, number, number, number];

export interface Params {
  // ── Trust (§6.2) ──
  /** Starting trust. */
  T0: number;
  /** Logistic regeneration rate; carrying capacity 100. */
  R: number;
  /** τ ~ UniformReal[TAU_MIN, TAU_MAX] per game. */
  TAU_MIN: number;
  TAU_MAX: number;
  TRUST_MAX: number;
  // ── Pace (§6.2) ──
  CAP_GAIN: ByPace;
  COMPUTE_COST: ByPace;
  DRAW: ByPace;
  INC_BASE: ByPace;
  // ── Safety (§5.1, §6.2) ──
  SAFETY_MAX: number;
  SAFETY_DRAW_EFF: number;
  SAFETY_INC_EFF: number;
  SAFETY_CAP_DRAG: number;
  /** Safety cost per percentage point. */
  BUDGET_REF: number;
  /** The reference firm count in the 8/N draw scaling (§6.3 step 4). */
  DRAW_REF_N: number;
  // ── Incidents ──
  INC_TRUST: number;
  INC_REV_LOSS: number;
  // ── Market and valuation ──
  M_PER_FIRM: number;
  GAMMA: number;
  ALPHA: number;
  CAP_MULT: number;
  CASH0: number;
  C0: number;
  // ── Moratorium ──
  COLLAPSE_CAP_WRITEDOWN: number;
  /** Fraction of positive cash retained at the moratorium. Negative cash is unchanged. */
  COLLAPSE_CASH_HAIRCUT: number;
  MORATORIUM_M: number;
  MORATORIUM_R: number;
  BACKLASH: number;
  INSOLVENCY: number;
  // ── Cards (§5.2) ──
  CARD_COST: Readonly<Record<Card, number>>;
  POACH_GAIN: number;
  POACH_LOSS: number;
  POACH_FLOOR: number;
  PUBLISH_TRUST: number;
  PUBLISH_INC_MULT: number;
  LOBBY_TRUST: number;
  BLITZ_MULT: number;
  // ── Defaults (§5.1, §6.4) ──
  DEFAULT_PACE: 1 | 2 | 3 | 4;
  DEFAULT_SAFETY: number;
  // ── Public exposure label cutoffs on d_i (§6.5): LOW < [0] ≤ MED < [1] ≤ HIGH < [2] ≤ SEVERE ──
  EXPO_CUTS: readonly [number, number, number];
  // ── Pacts and audits (§9) ──
  /** Fine as a fraction of cash for the 1st, 2nd and 3rd detected violation. */
  FINE_RATES: readonly [number, number, number];
  FINE_MIN: number;
  /** Detected violation count at which a firm is expelled. */
  EXPEL_AT: number;
  /** An audit examines at most this many most recent unaudited rounds. */
  AUDIT_WINDOW: number;
  /** Rounds the BREACH flag stays on the board. */
  BREACH_FLAG_ROUNDS: number;
  /** A pact with fewer than 2 members after this many rounds dissolves. */
  PACT_GRACE_ROUNDS: number;
  PACT_MIN_MEMBERS: number;
  // ── Settings defaults and limits (§4, §5.4) ──
  AUTO_AUDIT_P: number;
  END_MIN: number;
  END_MAX: number;
  MAX_ROUNDS: number;
  // ── Bots (§7) ──
  BOT_CAUTIOUS: { pace: 1 | 2 | 3 | 4; safety: number };
  BOT_STANDARD: { pace: 1 | 2 | 3 | 4; safety: number };
  BOT_GREEDY_SAFETY: number;
  /** Probability the greedy bot picks pace 4 rather than 3. */
  BOT_GREEDY_P4: number;
  BOT_MIMIC_SAFETY: number;
  BOT_MIMIC_FALLBACK_PACE: 1 | 2 | 3 | 4;
  /** Counterfactual and calibration policy (§8.1, §10). */
  BOT_SUSTAINABLE: { pace: 1 | 2 | 3 | 4; safety: number };
  // ── Headlines (§6.3 step 15, §15.4) ──
  HEADLINES_MIN: number;
  HEADLINES_MAX: number;
  /** Chance of a trust-band headline in a round where the band did not change. */
  TRUST_BAND_P: number;
  /** Lower bounds of the trust bands, highest first. */
  TRUST_BANDS: readonly [number, number, number, number, number];
}

export const PARAMS: Params = {
  T0: 72,
  R: 0.13, // calibrated: 0.16 → 0.25 (Session 2) → 0.13 (Session 16, docs/CALIBRATION.md)
  TAU_MIN: 30,
  TAU_MAX: 40,
  TRUST_MAX: 100,

  CAP_GAIN: [2, 4, 7, 11],
  COMPUTE_COST: [12, 20, 32, 48],
  DRAW: [0.125, 0.25, 1.2, 1.4], // calibrated: [1.0, 2.5, 5.5, 9.0] → [0.125, 0.3125, 0.6875, 1.125] (Session 2) → this (Session 16)
  INC_BASE: [0.02, 0.05, 0.15, 0.3],

  SAFETY_MAX: 30,
  SAFETY_DRAW_EFF: 0.6,
  SAFETY_INC_EFF: 0.7,
  SAFETY_CAP_DRAG: 0.25,
  BUDGET_REF: 1.0,
  DRAW_REF_N: 8,

  INC_TRUST: 1.5, // calibrated, was 4.0 (Session 16)
  INC_REV_LOSS: 0.15,

  M_PER_FIRM: 100,
  GAMMA: 1.4,
  ALPHA: 2.0,
  CAP_MULT: 3.0,
  CASH0: 100,
  C0: 20,

  COLLAPSE_CAP_WRITEDOWN: 0.15,
  COLLAPSE_CASH_HAIRCUT: 0.6,
  MORATORIUM_M: 0.15,
  MORATORIUM_R: 0.25,
  BACKLASH: 10,
  INSOLVENCY: -100,

  CARD_COST: { NONE: 0, POACH: 15, PUBLISH: 10, LOBBY: 10, BLITZ: 15 },
  POACH_GAIN: 3,
  POACH_LOSS: 3,
  POACH_FLOOR: 10,
  PUBLISH_TRUST: 1.0,
  PUBLISH_INC_MULT: 0.5,
  LOBBY_TRUST: 0.5,
  BLITZ_MULT: 1.2,

  DEFAULT_PACE: 2,
  DEFAULT_SAFETY: 10,

  EXPO_CUTS: [0.15, 0.55, 1.21], // follow DRAW (§6.5): [1.5, 3.5, 6] → [0.1875, 0.4375, 0.75] (Session 2) → this (Session 16)

  FINE_RATES: [0.1, 0.25, 0.4],
  FINE_MIN: 10,
  EXPEL_AT: 3,
  AUDIT_WINDOW: 3,
  BREACH_FLAG_ROUNDS: 2,
  PACT_GRACE_ROUNDS: 2,
  PACT_MIN_MEMBERS: 2,

  AUTO_AUDIT_P: 0.25,
  END_MIN: 10,
  END_MAX: 14,
  MAX_ROUNDS: 30,

  BOT_CAUTIOUS: { pace: 1, safety: 20 },
  BOT_STANDARD: { pace: 2, safety: 10 },
  BOT_GREEDY_SAFETY: 5,
  BOT_GREEDY_P4: 0.5,
  BOT_MIMIC_SAFETY: 8,
  BOT_MIMIC_FALLBACK_PACE: 3,
  BOT_SUSTAINABLE: { pace: 2, safety: 15 },

  HEADLINES_MIN: 2,
  HEADLINES_MAX: 4,
  TRUST_BAND_P: 0.3,
  TRUST_BANDS: [80, 70, 60, 50, 40],
};

/** The entry of a per-pace table for pace 1–4. */
export const byPace = (arr: ByPace, pace: 1 | 2 | 3 | 4): number => arr[(pace - 1) as 0 | 1 | 2 | 3];
