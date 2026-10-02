/**
 * An engine-only replica of the 14-quarter rehearsal (scripts/e2e-rehearsal.ts): eight bot clients
 * on the `mixed` policy, one scripted firm at pace 4 with safety 0, and disclosure on for quarters
 * 4 to 9. It lets the rehearsal use a fixed seed that is known to end in a moratorium, and a unit
 * test (tests/tools/rehearsal-model.test.ts) keeps that seed honest.
 */
import {
  createGame,
  mulberry32,
  resolveRound,
  type Decision,
  type EngineState,
  type FirmInit,
  type Pace,
} from '../../src/engine';
import { assignPolicies, decide } from '../../tools/bots/policy';

export const REHEARSAL_QUARTERS = 14;
/** Disclosure is on while these quarters resolve. */
export const DISCLOSURE_ON = { from: 4, to: 9 } as const;
export const HUMAN: Decision = { pace: 4, safety: 0, card: 'NONE', target: null };

export interface RehearsalOutcome {
  collapseRound: number | null;
  tau: number;
  trust: number[];
}

export function simulateRehearsal(seed: number, botSeed = 1): RehearsalOutcome {
  const policies = assignPolicies('mixed', 8);
  const firms: FirmInit[] = [...policies.map((_, i) => ({ id: `b${i}`, ticker: `BT${i}`, isBot: false, botPolicy: null })), { id: 'human', ticker: 'HUMN', isBot: false, botPolicy: null }];
  let state: EngineState = createGame(
    { label: 'REHR', endMode: 'fixed', minEnd: 14, maxEnd: 14, fixedEnd: REHEARSAL_QUARTERS, disclosure: false, autoAuditP: 0 },
    firms,
    seed,
  );
  const trust: number[] = [];
  const rngs = policies.map((_, i) => mulberry32(botSeed * 1000 + i));
  for (let r = 1; r <= REHEARSAL_QUARTERS; r++) {
    state.disclosure = r >= DISCLOSURE_ON.from && r <= DISCLOSURE_ON.to;
    const last = state.history[state.history.length - 1];
    const leader = state.firms.find((f) => f.rank === 1);
    const seen = last?.disclosure && leader ? last.disclosure[leader.id] : undefined;
    const decisions: Record<string, Decision> = { human: HUMAN };
    state.firms.forEach((f) => {
      const i = policies.findIndex((_, k) => `b${k}` === f.id);
      if (i < 0) return;
      // tools/bots.ts draws once for the delay and once for the decision in every quarter.
      rngs[i]!();
      const u = rngs[i]!();
      decisions[f.id] = decide(policies[i]!, { lastCard: f.lastCard, insolvent: f.insolvent || f.cash < 0, leaderPace: (seen?.pace ?? null) as Pace | null }, u);
    });
    const res = resolveRound(state, decisions);
    state = res.state;
    trust.push(state.T);
  }
  return { collapseRound: state.collapseRound, tau: state.tau, trust };
}
