/**
 * Shared fixture for the rules tests (spec §13). Run only through `npm run test:rules`,
 * which starts the emulators with project `demo-frontier`.
 *
 * Users:
 * - fac   facilitator on the allowlist; created game g1
 * - fac2  facilitator on the allowlist; created game g2
 * - fake  allowlist value is the string "true", not the boolean
 * - uA    participant, member of firm fA (PIN 1111)
 * - uA2   participant, teammate of uA in fA
 * - uB    participant, member of firm fB (PIN 2222)
 * - uX    signed in, no membership
 */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach } from 'vitest';

// Compat database type from the test library; it has no exported alias.
export type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['database']>;

export const G = 'g1';
export const G2 = 'g2';
export const ROUND = 2;

let env: RulesTestEnvironment;

export function useEnv(): void {
  beforeAll(async () => {
    const hostPort = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    if (!hostPort) throw new Error('Run the rules tests with `npm run test:rules` (database emulator not found).');
    const [host, port] = hostPort.split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-frontier',
      database: { host: host ?? '127.0.0.1', port: Number(port), rules: readFileSync('database.rules.json', 'utf8') },
    });
  });
  beforeEach(async () => {
    await env.clearDatabase();
    await seed();
  });
  afterAll(async () => {
    await env?.cleanup();
  });
}

export const as = (uid: string): Db => env.authenticatedContext(uid).database();
export const anon = (): Db => env.unauthenticatedContext().database();

/** Writes with rules disabled (test setup only). */
export async function admin(path: string, value: unknown): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref(path).set(value);
  });
}

export async function adminUpdate(path: string, value: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref(path).update(value);
  });
}

export const g = (rest = ''): string => `games/${G}${rest ? `/${rest}` : ''}`;

/** Server-timestamp placeholder. */
export const NOW = { '.sv': 'timestamp' } as const;

export function publicNode(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phase: 'open',
    round: ROUND,
    deadline: Date.now() + 60_000,
    paused: false,
    disclosure: false,
    T: 72,
    M: 400,
    collapsed: false,
    joinLocked: false,
    revealStep: 0,
    ...over,
  };
}

function game(facilitatorUid: string, code: string): Record<string, unknown> {
  return {
    meta: { code, title: 'Rules test', createdAt: 1, facilitatorUid, settings: { timerSec: 120 } },
    public: publicNode(),
    firms: {
      fA: { name: 'Arcane Labs', ticker: 'ARCN', createdAt: 1, order: 0, isBot: false },
      fB: { name: 'Brightlake', ticker: 'BRLK', createdAt: 2, order: 1, isBot: false },
      fC: { name: 'Cyra Systems', ticker: 'CYRA', createdAt: 3, order: 2, isBot: true, botPolicy: 'greedy' },
    },
    firmSecrets: { fA: { pin: '1111' }, fB: { pin: '2222' } },
    firmsPublic: {
      fA: { share: 0.4, profit: 10, valuation: 300, rank: 1, rankDelta: 0, submittedRound: 1, auto: false, insolvent: false, breachUntilRound: 0 },
      fB: { share: 0.3, profit: 8, valuation: 250, rank: 2, rankDelta: 0, submittedRound: 1, auto: false, insolvent: false, breachUntilRound: 0 },
    },
    firmsPrivate: {
      fA: { cash: 120, cap: 100, lastCard: 'NONE', cumulativeDraw: 1.2, incidents: 0 },
      fB: { cash: 90, cap: 100, lastCard: 'PUBLISH', cumulativeDraw: 0.8, incidents: 1 },
    },
    members: {
      uA: { firmId: 'fA', pin: '1111', label: 'AB', joinedAt: 1 },
      uA2: { firmId: 'fA', pin: '1111', label: 'CD', joinedAt: 1 },
      uB: { firmId: 'fB', pin: '2222', joinedAt: 1 },
    },
    presence: {
      uA: { online: true, lastSeen: 1 },
      uA2: { online: false, lastSeen: 1 },
      uB: { online: true, lastSeen: 1 },
    },
    decisions: {
      [ROUND]: {
        fA: { pace: 2, safety: 10, card: 'NONE', by: 'uA', at: 1 },
        fB: { pace: 3, safety: 5, card: 'NONE', by: 'uB', at: 1 },
      },
    },
    wire: { 'd-1-on': { at: 1, round: 1, seq: 1, kind: 'disclosure-on', text: 'Assembly passes frontier disclosure rule' } },
    rounds: {
      1: {
        T: 72, dT: 0, M: 400, incidents: 0, headlines: [{ kind: 'ambient', text: 'Markets open.' }],
        results: { fA: { share: 0.7, profit: 10, valuation: 300, rank: 1 }, fB: { share: 0.3, profit: 8, valuation: 250, rank: 2 } },
      },
    },
    pacts: {
      p1: { name: 'PACT-A', proposer: 'fA', terms: { maxPace: 2 }, members: { fA: 1 }, createdRound: 1, status: 'active' },
    },
    pactsPrivate: { p1: { violations: { 1: { fA: true } }, sanctions: { fA: 0 }, lastAuditRound: 0 } },
    engine: { seed: 7, tau: 35.2, endMode: 'random', endRound: 12 },
    results: { dataLines: ['DATA game=KXMT'] },
  };
}

async function seed(): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      facilitators: { fac: true, fac2: true, fake: 'true' },
      codes: { KXMT: G, PLRV: G2 },
      games: { [G]: game('fac', 'KXMT'), [G2]: game('fac2', 'PLRV') },
    });
  });
}

/** A valid decision for the open round. */
export function decision(by: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { pace: 2, safety: 12, card: 'NONE', by, at: NOW, ...over };
}

/** Multi-path update that founds firm `fN` for `uid` (spec §13 firm creation). */
export function foundFirm(uid: string, over: { firm?: Record<string, unknown>; pin?: unknown; memberPin?: unknown; omit?: 'secret' | 'member' } = {}): Record<string, unknown> {
  const u: Record<string, unknown> = {
    'firms/fN': { name: 'Northwind', ticker: 'NWND', createdAt: NOW, order: 3, isBot: false, ...over.firm },
    'firmSecrets/fN': { pin: over.pin ?? '4321' },
    [`members/${uid}`]: { firmId: 'fN', pin: over.memberPin ?? over.pin ?? '4321', label: 'EF', joinedAt: NOW },
  };
  if (over.omit === 'secret') delete u['firmSecrets/fN'];
  if (over.omit === 'member') delete u[`members/${uid}`];
  return u;
}
