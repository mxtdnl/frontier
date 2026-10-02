/**
 * The data layer against the emulators, through the real Firebase web SDK and the real
 * rules. Run with `npm run test:rules`.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInAnonymously } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, goOffline, ref, set, type Database } from 'firebase/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PARAMS, createGame, resolveRound } from '../../src/engine';
import * as api from '../../src/firebase/api';
import { EMULATOR_HOST, EMULATOR_AUTH_PORT, EMULATOR_DATABASE_PORT } from '../../src/firebase/config';
import { emulatorOptions } from '../../src/firebase/init';
import { paths } from '../../src/firebase/paths';
import { subscribeServerTimeOffset, trackPresence } from '../../src/firebase/presence';
import type { EngineNode, MetaNode, PublicNode } from '../../src/firebase/schema';
import { adminSet, loadRules } from '../../scripts/emulator-rules';
import { storeAndRead } from '../firebase/rtdb';

interface Client {
  app: FirebaseApp;
  db: Database;
  uid: string;
}

const apps: FirebaseApp[] = [];
let n = 0;

async function client(kind: 'anon' | 'email'): Promise<Client> {
  const app = initializeApp(emulatorOptions, `client-${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, EMULATOR_HOST, EMULATOR_DATABASE_PORT);
  const cred =
    kind === 'anon' ? await signInAnonymously(auth) : await createUserWithEmailAndPassword(auth, `fac${n}-${Date.now()}@example.test`, 'password123');
  return { app, db, uid: cred.user.uid };
}

const until = <T>(subscribe: (cb: (v: T) => void) => () => void, ok: (v: T) => boolean): Promise<T> =>
  new Promise((resolve) => {
    const unsub = subscribe((v) => {
      if (ok(v)) {
        queueMicrotask(() => unsub());
        resolve(v);
      }
    });
  });

const G = 'gApi';
let fac: Client;
let p1: Client;
let p2: Client;
let firmId = '';
let pin = '';

beforeAll(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Run with `npm run test:rules`.');
  await loadRules();
  await adminSet('', null);
  fac = await client('email');
  p1 = await client('anon');
  p2 = await client('anon');
  await adminSet(`facilitators/${fac.uid}`, true);
});

afterAll(async () => {
  for (const a of apps) {
    goOffline(getDatabase(a));
    await deleteApp(a);
  }
});

const meta = (uid: string): MetaNode => ({ code: 'KXMT', title: 'API test', createdAt: 1, facilitatorUid: uid, settings: { timerSec: 120, autoResolve: false, revealThreshold: false, litRoom: false } });
const pub = (over: Partial<PublicNode> = {}): PublicNode => ({
  phase: 'lobby', round: 0, deadline: null, paused: false, disclosure: false, T: 72, M: 400, collapsed: false, collapseRound: null,
  joinLocked: false, resolvingBy: null, endedAt: null, revealStep: 0, resumePhase: null, pausedRemainingMs: null, ...over,
});

describe('data layer against the emulator', () => {
  it('lets a facilitator check the allowlist, create a game and claim its code', async () => {
    expect(await api.isFacilitator(fac.db, fac.uid)).toBe(true);
    expect(await api.isFacilitator(p1.db, p1.uid)).toBe(false);
    await api.createGameRecord(fac.db, G, meta(fac.uid), pub());
    expect(await api.resolveCode(p1.db, 'KXMT')).toBe(G);
    // A code already in use cannot be claimed again, even by the same facilitator.
    await expect(api.createGameRecord(fac.db, 'gOther', meta(fac.uid), pub())).rejects.toThrow();
    expect(await api.readMeta(fac.db, 'gOther')).toBeNull();
  });

  it('lets a participant found a firm and a teammate join with the PIN', async () => {
    pin = api.generatePin();
    expect(pin).toMatch(/^\d{4}$/);
    firmId = await api.foundFirm(p1.db, G, p1.uid, { name: 'Arcane Labs', ticker: 'ARCN', pin, label: 'AB', order: 0 });
    expect((await api.readFirms(p2.db, G))[firmId]).toMatchObject({ name: 'Arcane Labs', ticker: 'ARCN', isBot: false, botPolicy: null });
    expect(await api.readFirmSecret(p1.db, G, firmId)).toEqual({ pin });
    const wrong = pin === '0000' ? '1111' : '0000';
    await expect(api.joinFirm(p2.db, G, p2.uid, firmId, wrong, 'CD')).rejects.toThrow();
    await api.joinFirm(p2.db, G, p2.uid, firmId, pin, 'CD');
    expect(await api.readMember(p1.db, G, p2.uid)).toMatchObject({ firmId, label: 'CD' });
  });

  it('allows a rejoin after the facilitator locks joins', async () => {
    await api.updatePublic(fac.db, G, { joinLocked: true, phase: 'briefing' });
    await api.joinFirm(p2.db, G, p2.uid, firmId, pin, 'CD');
    const p3 = await client('anon');
    await expect(api.joinFirm(p3.db, G, p3.uid, firmId, pin, '')).rejects.toThrow();
  });

  it('stores the engine state and reads it back exactly', async () => {
    const botId = await api.addBotFirm(fac.db, G, { name: 'Cyra Systems', ticker: 'CYRA', order: 1, isBot: true, botPolicy: 'greedy' });
    let s = createGame({ label: 'KXMT', endMode: 'manual', minEnd: 10, maxEnd: 14, fixedEnd: null, disclosure: true, autoAuditP: 1 }, [
      { id: firmId, ticker: 'ARCN', isBot: false, botPolicy: null },
      { id: botId, ticker: 'CYRA', isBot: true, botPolicy: 'greedy' },
    ], 5);
    s.pacts.push({ id: 'p1', name: 'PACT-A', proposer: firmId, terms: { maxPace: 2, minSafety: null }, members: { [firmId]: 1, [botId]: 1 }, createdRound: 1, status: 'active' });
    for (let r = 0; r < 3; r++) {
      s = resolveRound(s, { [firmId]: { pace: 4, safety: 0, card: 'NONE', target: null } }, PARAMS).state;
    }
    const node: EngineNode = { ...s, params: PARAMS, rngNotes: null, cfCache: null };
    await api.writeEngine(fac.db, G, node);
    expect(await api.readEngine(fac.db, G)).toEqual(node);
    const raw: unknown = (await get(ref(fac.db, paths.engine(G)))).val();
    expect(raw).toEqual(storeAndRead(node));
    await expect(api.readEngine(p1.db, G)).rejects.toThrow();
  });

  it('accepts a decision while open and stamps the server time', async () => {
    await api.updatePublic(fac.db, G, { phase: 'open', round: 1, deadline: Date.now() + 60_000 });
    await api.submitDecision(p1.db, G, 1, firmId, p1.uid, { pace: 3, safety: 12, card: 'NONE', target: 'ignored' });
    const d = await until<Awaited<ReturnType<typeof api.readDecisions>>[string] | null>((cb) => api.subscribeDecision(p2.db, G, 1, firmId, cb), (v) => v !== null);
    expect(d).toMatchObject({ pace: 3, safety: 12, card: 'NONE', target: null, by: p1.uid });
    expect(d?.at).toBeGreaterThan(0);
    expect(Object.keys(await api.readDecisions(fac.db, G, 1))).toEqual([firmId]);
  });

  it('rejects a decision after the deadline', async () => {
    await api.updatePublic(fac.db, G, { deadline: Date.now() - 10_000 });
    await expect(api.submitDecision(p1.db, G, 1, firmId, p1.uid, { pace: 1, safety: 30, card: 'NONE', target: null })).rejects.toThrow();
  });

  it('lets a firm propose, join and leave pacts', async () => {
    await api.updatePublic(fac.db, G, { phase: 'summit' });
    const pactId = await api.proposePact(p1.db, G, 1, firmId, 'PACT-B', { maxPace: null, minSafety: 10 });
    const pacts = await api.readPacts(p2.db, G);
    expect(pacts[pactId]).toEqual({ id: pactId, name: 'PACT-B', proposer: firmId, terms: { maxPace: null, minSafety: 10 }, members: { [firmId]: 1 }, createdRound: 1, status: 'active' });
    await api.leavePact(p2.db, G, pactId, firmId);
    expect((await api.readPact(p1.db, G, pactId)).members).toEqual({});
    await api.joinPact(p2.db, G, pactId, firmId, 1);
    expect((await api.readPact(p1.db, G, pactId)).members).toEqual({ [firmId]: 1 });
  });

  it('publishes presence, marks it offline on stop, and reports a server time offset', async () => {
    const stop = trackPresence(p1.db, G, p1.uid);
    const on = await until<Record<string, { online: boolean }>>((cb) => api.subscribePresenceAll(fac.db, G, cb), (v) => v[p1.uid]?.online === true);
    expect(on[p1.uid]?.online).toBe(true);
    expect((await get(ref(p2.db, paths.presenceOnline(G, p1.uid)))).val()).toBe(true);
    await expect(get(ref(p2.db, paths.presence(G, p1.uid)))).rejects.toThrow();
    stop();
    await until<Record<string, { online: boolean }>>((cb) => api.subscribePresenceAll(fac.db, G, cb), (v) => v[p1.uid]?.online === false);
    const offset = await until<number>((cb) => subscribeServerTimeOffset(p1.db, cb), () => true);
    expect(Number.isFinite(offset)).toBe(true);
  });

  it('denies a participant writing a facilitator-only node', async () => {
    await expect(set(ref(p1.db, paths.public(G)), { phase: 'ended' })).rejects.toThrow();
  });

  it('shows results to participants only once ended, then deletes the game and frees the code', async () => {
    await api.writeResults(fac.db, G, { final: { [firmId]: { rank: 1 } }, counterfactual: null, attribution: [], dataLines: ['DATA game=KXMT'] });
    await expect(api.readResults(p1.db, G)).rejects.toThrow();
    await api.updatePublic(fac.db, G, { phase: 'ended' });
    expect(await api.readResults(p1.db, G)).toEqual({ final: { [firmId]: { rank: 1 } }, counterfactual: null, attribution: [], dataLines: ['DATA game=KXMT'] });
    await api.deleteGame(fac.db, G, 'KXMT');
    expect(await api.resolveCode(p1.db, 'KXMT')).toBeNull();
    expect(await api.readMeta(fac.db, G)).toBeNull();
  });

});
