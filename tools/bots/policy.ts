/**
 * Decisions for the bot clients (spec §7). A bot client is an ordinary participant, so it sees only
 * participant-readable data: its own private node, the public board and the published disclosure
 * snapshot. It therefore cannot reuse the engine's `botDecision`, which reads the full engine state.
 * The numbers all come from PARAMS.
 */
import { PARAMS, type BotPolicy, type Card, type Decision, type Pace, type Params } from '../../src/engine';

export type ClientPolicy = BotPolicy | 'mixed';

export const POLICIES: ReadonlyArray<ClientPolicy> = ['cautious', 'standard', 'greedy', 'mimic-leader', 'mixed'];
const MIX: ReadonlyArray<BotPolicy> = ['cautious', 'standard', 'greedy', 'mimic-leader'];

export function isClientPolicy(v: string): v is ClientPolicy {
  return (POLICIES as ReadonlyArray<string>).includes(v);
}

/** One concrete policy per firm. `mixed` cycles through the four policies in order. */
export function assignPolicies(policy: ClientPolicy, firms: number): BotPolicy[] {
  return Array.from({ length: firms }, (_, i) => (policy === 'mixed' ? MIX[i % MIX.length]! : policy));
}

/** What a participant client can see when it decides. */
export interface BotView {
  lastCard: Card;
  insolvent: boolean;
  /** Last quarter's published pace of the current valuation leader; null without disclosure. */
  leaderPace: Pace | null;
}

/** `u` is a uniform draw in [0, 1) used by the greedy policy's 50/50 pace choice. */
export function decide(policy: BotPolicy, view: BotView, u: number, p: Params = PARAMS): Decision {
  switch (policy) {
    case 'cautious':
      return { pace: p.BOT_CAUTIOUS.pace, safety: p.BOT_CAUTIOUS.safety, card: 'NONE', target: null };
    case 'standard':
      return { pace: p.BOT_STANDARD.pace, safety: p.BOT_STANDARD.safety, card: 'NONE', target: null };
    case 'greedy': {
      const pace: Pace = u < p.BOT_GREEDY_P4 ? 4 : 3;
      const card: Card = !view.insolvent && view.lastCard !== 'BLITZ' ? 'BLITZ' : 'NONE';
      return { pace, safety: p.BOT_GREEDY_SAFETY, card, target: null };
    }
    case 'mimic-leader':
      return { pace: view.leaderPace ?? p.BOT_MIMIC_FALLBACK_PACE, safety: p.BOT_MIMIC_SAFETY, card: 'NONE', target: null };
  }
}
