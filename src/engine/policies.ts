/** Bot and scenario policies (spec §7, §8.1, §10). */
import { allowedCards } from './cards';
import type { Params } from './params';
import type { Decision, EngineState, FirmState, Pace, Policy } from './types';

/**
 * Decision for a policy-driven firm. `u` is this firm's draw from the `bot` stream
 * for the round; every firm consumes one draw so bots never shift each other's draws.
 */
export function botDecision(policy: Policy, firm: FirmState, state: EngineState, u: number, p: Params): Decision {
  switch (policy) {
    case 'cautious':
      return { pace: p.BOT_CAUTIOUS.pace, safety: p.BOT_CAUTIOUS.safety, card: 'NONE', target: null };
    case 'standard':
      return { pace: p.BOT_STANDARD.pace, safety: p.BOT_STANDARD.safety, card: 'NONE', target: null };
    case 'sustainable':
      return { pace: p.BOT_SUSTAINABLE.pace, safety: p.BOT_SUSTAINABLE.safety, card: 'NONE', target: null };
    case 'greedy': {
      const pace: Pace = u < p.BOT_GREEDY_P4 ? 4 : 3;
      const card = allowedCards(firm).includes('BLITZ') ? 'BLITZ' : 'NONE';
      return { pace, safety: p.BOT_GREEDY_SAFETY, card, target: null };
    }
    case 'mimic-leader':
      return { pace: mimicPace(state, p), safety: p.BOT_MIMIC_SAFETY, card: 'NONE', target: null };
  }
}

/**
 * The previous-round pace of the current valuation leader, read from the last round's
 * disclosure snapshot. Without disclosure the bot cannot see it and uses the fallback.
 */
function mimicPace(state: EngineState, p: Params): Pace {
  const last = state.history[state.history.length - 1];
  const leader = state.firms.find((f) => f.rank === 1);
  const seen = last?.disclosure && leader ? last.disclosure[leader.id] : undefined;
  return seen ? seen.pace : p.BOT_MIMIC_FALLBACK_PACE;
}
