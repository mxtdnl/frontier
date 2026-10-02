/**
 * The orchestrator against the emulators, through the real Firebase SDK and the real rules:
 * session creation, the phase machine, the lock transaction across two windows, the atomic
 * resolution write, and what participants can and cannot read. Run with `npm run test:rules`.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, goOffline, ref, type Database } from 'firebase/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as api from '../../src/firebase/api';
import { EMULATOR_AUTH_PORT, EMULATOR_DATABASE_PORT, EMULATOR_HOST } from '../../src/firebase/config';
import { emulatorOptions } from '../../src/firebase/init';
import {
  addTime,
  advance,
  createSession,
  endSession,
  firebaseIO,
  resolveCurrentRound,
  retryResolution,
  setPaused,
  toggleSummit,
  type Ctx,
} from '../../src/firebase/orchestrator';
import { paths } from '../../src/firebase/paths';
import { adminSet, loadRules } from '../../scripts/emulator-rules';

interface Client {
  app: FirebaseApp;
  db: Database;
  uid: string;
}
const apps: FirebaseApp[] = [];
let n = 0;

async function open(kind: 'anon' | { email: string; password: string; create: boolean }): Promise<Client> {
  const app = initializeApp(emulatorOptions, `orch-${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, EMULATOR_HOST, EMULATOR_DATABASE_PORT);
  const cred =
    kind === 'anon'
      ? await signInAnonymously(auth)
      : kind.create
        ? await createUserWithEmailAndPassword(auth, kind.email, kind.password)
        : await signInWithEmailAndPassword(auth, kind.email, kind.password);
  return { app, db, uid: cred.user.uid };
}

const ctxFor = (c: Client, g: string, windowId: string): Ctx => ({ io: firebaseIO(c.db, g), uid: c.uid, windowId, now: () => Date.now() });

let fac: Client;
let fac2: Client; // a second window of the same account
let p1: Client;
let p2: Client;
let g = '';
let code = '';
let ctx: Ctx;
let ctx2: Ctx;
let humanA = '';
let humanB = '';

const email = `orch-${Date.now()}@example.test`;

beforeAll(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Run with `npm run test:rules`.');
  await loadRules();
  await adminSet('', null);
  fac = await open({ email, password: 'password123', create: true });
  fac2 = await open({ email, password: 'password123', create: false });
  p1 = await open('anon');
  p2 = await open('anon');
  await adminSet(`facilitators/${fac.uid}`, true);
});

afterAll(async () => {
  for (const a of apps) {
    goOffline(getDatabase(a));
    await deleteApp(a);
  }
});

const readPub = () => api.readPublic(fac.db, g);

describe('orchestrator against the emulator', () => {
  it('creates a session: game, code, hidden engine node and bot firms, in one update', async () => {
    const made = await createSession(fac.db, fac.uid, {
      timerSec: 60, autoResolve: false, endMode: 'fixed', minEnd: 10, maxEnd: 14, fixedEnd: 2, disclosure: false, autoAuditP: 0.25,
      revealThreshold: false, litRoom: false, bots: ['standard', 'greedy'], seed: '4242',
    });
    g = made.gameId;
    code = made.code;
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(await api.resolveCode(p1.db, code)).toBe(g);
    const engine = await api.readEngine(fac.db, g);
    expect(engine?.endRound).toBe(2);
    expect(engine?.tau).toBeGreaterThanOrEqual(30);
    expect(engine?.tau).toBeLessThanOrEqual(40);
    expect(Object.values(await api.readFirms(p1.db, g)).filter((f) => f.isBot)).toHaveLength(2);
    expect(await readPub()).toMatchObject({ phase: 'lobby', round: 0, joinLocked: false, resumePhase: null, pausedRemainingMs: null });
    ctx = ctxFor(fac, g, 'w1');
    ctx2 = ctxFor(fac2, g, 'w2');
  });

  it('retries on a taken code and keeps the first game intact', async () => {
    let calls = 0;
    const made = await createSession(
      fac.db,
      fac.uid,
      { timerSec: 60, autoResolve: false, endMode: 'manual', minEnd: 10, maxEnd: 14, fixedEnd: 12, disclosure: false, autoAuditP: 0.25, revealThreshold: false, litRoom: false, bots: [], seed: '' },
      () => (calls++ < 2 ? code : 'ZZZZ'),
    );
    expect(made.code).toBe('ZZZZ');
    expect(await api.resolveCode(p1.db, code)).toBe(g);
  });

  it('never lets a participant read the engine node', async () => {
    await expect(api.readEngine(p1.db, g)).rejects.toThrow();
    await expect(get(ref(p1.db, paths.engine(g)))).rejects.toThrow();
  });

  it('refuses the briefing with fewer than two humans-plus-bots, then proceeds once firms exist', async () => {
    // Two bots already count as two firms; add two human firms through the participant API.
    humanA = await api.foundFirm(p1.db, g, p1.uid, { name: 'Alpha Works', ticker: 'ALPH', pin: '1234', label: 'A', order: 9 });
    humanB = await api.foundFirm(p2.db, g, p2.uid, { name: 'Beta Works', ticker: 'BETA', pin: '4321', label: 'B', order: 9 });
    const r = await advance(ctx, { phase: 'lobby', round: 0 });
    expect(r.ok).toBe(true);
    const pub = await readPub();
    expect(pub).toMatchObject({ phase: 'briefing', joinLocked: true });
    expect(pub?.M).toBeGreaterThan(0);
    const engine = await api.readEngine(fac.db, g);
    expect(engine?.firms).toHaveLength(4);
    expect(engine?.firms.map((f) => f.isBot)).toEqual([true, true, false, false]);
    // Firm creation is now locked.
    const p3 = await open('anon');
    await expect(api.foundFirm(p3.db, g, p3.uid, { name: 'Gamma Works', ticker: 'GAMM', pin: '1111', label: '', order: 9 })).rejects.toThrow();
  });

  it('opens quarter 1 with a server-time deadline; a stale second press is refused', async () => {
    const before = Date.now();
    expect((await advance(ctx, { phase: 'briefing', round: 0 })).ok).toBe(true);
    const pub = await readPub();
    expect(pub).toMatchObject({ phase: 'open', round: 1 });
    expect(pub?.deadline).toBeGreaterThan(before + 55_000);
    expect(pub?.deadline).toBeLessThan(Date.now() + 65_000);
    expect((await advance(ctx2, { phase: 'briefing', round: 0 })).ok).toBe(false);
    expect((await readPub())?.phase).toBe('open');
  });

  it('accepts a participant decision while open, refuses one while the timer is paused', async () => {
    await api.submitDecision(p1.db, g, 1, humanA, p1.uid, { pace: 3, safety: 8, card: 'NONE', target: null });
    expect((await setPaused(ctx, true)).ok).toBe(true);
    expect((await readPub())?.deadline).toBeNull();
    await expect(api.submitDecision(p1.db, g, 1, humanA, p1.uid, { pace: 4, safety: 0, card: 'NONE', target: null })).rejects.toThrow();
    expect((await setPaused(ctx, false)).ok).toBe(true);
    expect((await addTime(ctx, 30_000)).ok).toBe(true);
    await api.submitDecision(p1.db, g, 1, humanA, p1.uid, { pace: 3, safety: 8, card: 'NONE', target: null });
  });

  it('summit freezes and restores the timer; decisions are refused during it', async () => {
    expect((await toggleSummit(ctx)).ok).toBe(true);
    const frozen = await readPub();
    expect(frozen).toMatchObject({ phase: 'summit', resumePhase: 'open', paused: true, deadline: null });
    expect(frozen?.pausedRemainingMs).toBeGreaterThan(50_000);
    await expect(api.submitDecision(p2.db, g, 1, humanB, p2.uid, { pace: 2, safety: 10, card: 'NONE', target: null })).rejects.toThrow();
    expect((await toggleSummit(ctx)).ok).toBe(true);
    expect(await readPub()).toMatchObject({ phase: 'open', paused: false, resumePhase: null });
  });

  it('lets exactly one of two windows of the same account resolve the quarter', async () => {
    const [a, b] = await Promise.all([resolveCurrentRound(ctx, 1), resolveCurrentRound(ctx2, 1)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const pub = await readPub();
    expect(pub).toMatchObject({ phase: 'reveal', round: 1, resolvingBy: null, deadline: null });
    const engine = await api.readEngine(fac.db, g);
    expect(engine?.round).toBe(1);
    expect(pub?.T).toBe(engine?.T);
  });

  it('wrote the quarter atomically: public nodes readable by participants, private nodes only by their firm', async () => {
    const rounds = await new Promise<Awaited<ReturnType<typeof api.readRound>>>((res, rej) => {
      api.readRound(p2.db, g, 1).then(res, rej);
    });
    expect(rounds?.T).toBeGreaterThan(0);
    expect(Object.keys(rounds?.results ?? {})).toHaveLength(4);
    const own = await new Promise<unknown>((res) => {
      const unsub = api.subscribeFirmPrivate(p1.db, g, humanA, (v) => {
        if (v && Object.keys(v.history).length) {
          queueMicrotask(unsub);
          res(v);
        }
      });
    });
    expect(own).toMatchObject({ history: { '1': { pace: 3, safety: 8, auto: false } } });
    await expect(get(ref(p1.db, paths.firmPrivate(g, humanB)))).rejects.toThrow();
    const engine = await api.readEngine(fac.db, g);
    const h = engine?.history[0];
    expect(h?.firms[humanB]?.auto).toBe(true);
    const fps = await new Promise<Awaited<ReturnType<typeof api.readFirms>>>((res, rej) => api.readFirms(p1.db, g).then(res, rej));
    expect(Object.keys(fps)).toHaveLength(4);
  });

  it('hides τ and the end round from every node a participant can read', async () => {
    const engine = await api.readEngine(fac.db, g);
    for (const node of ['meta', 'public', 'firms', 'firmsPublic', 'rounds', 'pacts']) {
      const snap = await get(ref(p1.db, `games/${g}/${node}`));
      const text = JSON.stringify(snap.val() ?? null);
      expect(text).not.toContain('tau');
      expect(text).not.toContain('endRound');
      expect(text).not.toContain(String(engine?.tau));
    }
  });

  it('opens quarter 2, then ends at the hidden end round', async () => {
    expect((await advance(ctx)).ok).toBe(true);
    expect(await readPub()).toMatchObject({ phase: 'open', round: 2 });
    expect((await advance(ctx)).ok).toBe(true); // force resolve with AUTO defaults
    expect((await readPub())?.phase).toBe('reveal');
    expect((await advance(ctx)).ok).toBe(true); // end round reached
    const pub = await readPub();
    expect(pub?.phase).toBe('ended');
    expect(pub?.endedAt).toBeGreaterThan(0);
    // Results become readable to participants only now.
    expect(await api.readResults(p1.db, g)).toBeNull();
  });

  it('refuses retry and end on a finished session', async () => {
    expect((await retryResolution(ctx, null)).ok).toBe(false);
    expect((await endSession(ctx)).ok).toBe(false);
  });
});
