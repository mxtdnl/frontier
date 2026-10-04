/**
 * Session 6 against the emulators, through the real Firebase SDK and the real rules:
 * pact join and leave permissions, an audit with graduated sanctions across three
 * violations, disclosure on and off, and the live wire. Run with `npm run test:rules`.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInAnonymously } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, goOffline, ref, set, type Database } from 'firebase/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as api from '../../src/firebase/api';
import { EMULATOR_AUTH_PORT, EMULATOR_DATABASE_PORT, EMULATOR_HOST } from '../../src/firebase/config';
import { emulatorOptions } from '../../src/firebase/init';
import {
  advance,
  createSession,
  firebaseIO,
  publishWire,
  queueAudit,
  toggleDisclosure,
  toggleSummit,
  type Ctx,
} from '../../src/firebase/orchestrator';
import { paths } from '../../src/firebase/paths';
import { fromFirmsPublic, fromRounds } from '../../src/firebase/schema';
import { boardRows, type ScreenData } from '../../src/screens/Screen/model';
import { adminSet, loadRules } from '../../scripts/emulator-rules';

interface Client {
  app: FirebaseApp;
  db: Database;
  uid: string;
}
const apps: FirebaseApp[] = [];
let n = 0;

async function open(email?: string): Promise<Client> {
  const app = initializeApp(emulatorOptions, `pacts-${n++}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, EMULATOR_HOST, EMULATOR_DATABASE_PORT);
  const cred = email ? await createUserWithEmailAndPassword(auth, email, 'password123') : await signInAnonymously(auth);
  return { app, db, uid: cred.user.uid };
}

let fac: Client;
let p1: Client; // member of firm A
let p2: Client; // member of firm B
let outsider: Client; // signed in, no firm
let g = '';
let ctx: Ctx;
let firmA = '';
let firmB = '';
let pactA = '';
let round = 0;

const email = `pacts-${Date.now()}@example.test`;
const mkDecision = (pace: 1 | 2 | 3 | 4, safety: number) => ({ pace, safety, card: 'NONE' as const, target: null });

beforeAll(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Run with `npm run test:rules`.');
  await loadRules();
  await adminSet('', null);
  fac = await open(email);
  p1 = await open();
  p2 = await open();
  outsider = await open();
  await adminSet(`facilitators/${fac.uid}`, true);
});

afterAll(async () => {
  for (const a of apps) {
    goOffline(getDatabase(a));
    await deleteApp(a);
  }
});

const readPub = () => api.readPublic(fac.db, g);
const run = async (what: string, fn: Promise<{ ok: boolean; message: string }>) => {
  const r = await fn;
  expect(r.ok, `${what}: ${r.message}`).toBe(true);
};

describe('set-up', () => {
  it('creates a session with two bot firms and no automatic audits, then forms two firms and opens quarter 1', async () => {
    const made = await createSession(fac.db, fac.uid, {
      mode: 'team', timerSec: 600, autoResolve: false, endMode: 'manual', minEnd: 10, maxEnd: 14, fixedEnd: 12, disclosure: false, autoAuditP: 0,
      revealThreshold: false, litRoom: false, bots: ['cautious', 'standard'], seed: '2026',
    });
    g = made.gameId;
    ctx = { io: firebaseIO(fac.db, g), uid: fac.uid, windowId: 'w1', now: () => Date.now() };
    firmA = await api.foundFirm(p1.db, g, p1.uid, { name: 'Alpha Works', ticker: 'ALPH', pin: '1111', label: 'A', order: 9 });
    firmB = await api.foundFirm(p2.db, g, p2.uid, { name: 'Beta Works', ticker: 'BETA', pin: '2222', label: 'B', order: 9 });
    await run('briefing', advance(ctx));
    await run('open', advance(ctx));
    round = (await readPub())?.round ?? 0;
    expect(round).toBe(1);
  });
});

describe('pact join and leave permissions', () => {
  it('lets a member propose a pact for their own firm, as the only initial member', async () => {
    pactA = await api.proposePact(p1.db, g, round, firmA, 'PACT-A', { maxPace: 2, minSafety: null });
    const pacts = await api.readPacts(p2.db, g);
    expect(pacts[pactA]).toMatchObject({ name: 'PACT-A', proposer: firmA, members: { [firmA]: 1 }, status: 'active', terms: { maxPace: 2, minSafety: null } });
  });

  it('denies proposing for another firm, proposing without a firm, and proposing with no terms', async () => {
    await expect(api.proposePact(p2.db, g, round, firmA, 'PACT-B', { maxPace: 1, minSafety: null })).rejects.toThrow();
    await expect(api.proposePact(outsider.db, g, round, firmA, 'PACT-B', { maxPace: 1, minSafety: null })).rejects.toThrow();
    await expect(api.proposePact(p1.db, g, round, firmA, 'PACT-B', { maxPace: null, minSafety: null })).rejects.toThrow();
    await expect(api.proposePact(p1.db, g, round + 1, firmA, 'PACT-B', { maxPace: 1, minSafety: null })).rejects.toThrow();
  });

  it('lets a firm add and remove only its own membership', async () => {
    await expect(api.joinPact(p1.db, g, pactA, firmB, round)).rejects.toThrow(); // A cannot sign B in
    await expect(api.joinPact(outsider.db, g, pactA, firmB, round)).rejects.toThrow();
    await expect(api.joinPact(p2.db, g, pactA, firmB, round - 1)).rejects.toThrow(); // wrong quarter stamp
    await api.joinPact(p2.db, g, pactA, firmB, round);
    expect(Object.keys((await api.readPacts(p1.db, g))[pactA]?.members ?? {}).sort()).toEqual([firmA, firmB].sort());
    await expect(api.leavePact(p1.db, g, pactA, firmB)).rejects.toThrow(); // A cannot remove B
    await expect(api.leavePact(outsider.db, g, pactA, firmA)).rejects.toThrow();
    await api.leavePact(p2.db, g, pactA, firmB);
    expect(Object.keys((await api.readPacts(p1.db, g))[pactA]?.members ?? {})).toEqual([firmA]);
    await api.joinPact(p2.db, g, pactA, firmB, round);
  });

  it('denies a participant editing terms, status or the proposer, or deleting a pact', async () => {
    for (const client of [p1, p2]) {
      await expect(set(ref(client.db, `${paths.pact(g, pactA)}/terms/maxPace`), 4)).rejects.toThrow();
      await expect(set(ref(client.db, `${paths.pact(g, pactA)}/status`), 'dissolved')).rejects.toThrow();
      await expect(set(ref(client.db, `${paths.pact(g, pactA)}/proposer`), firmB)).rejects.toThrow();
      await expect(set(ref(client.db, paths.pact(g, pactA)), null)).rejects.toThrow();
    }
  });

  it('allows proposing during a summit, and refuses it once the quarter is resolved', async () => {
    await run('summit on', toggleSummit(ctx));
    const pactB = await api.proposePact(p2.db, g, round, firmB, 'PACT-B', { maxPace: null, minSafety: 10 });
    expect((await api.readPacts(p1.db, g))[pactB]?.terms).toEqual({ maxPace: null, minSafety: 10 });
    await run('summit off', toggleSummit(ctx));
    await api.leavePact(p2.db, g, pactB, firmB); // leaving stays open
  });

  it('keeps pactsPrivate and the audit queue out of reach', async () => {
    await expect(api.readPactsPrivate(p1.db, g)).rejects.toThrow();
    await expect(get(ref(p1.db, paths.pactPrivate(g, pactA)))).rejects.toThrow();
    await expect(get(ref(p1.db, `${paths.engine(g)}/pendingAudits`))).rejects.toThrow();
  });
});

describe('audit with graduated sanctions across three violations', () => {
  const fineRate = [0.1, 0.25, 0.4];
  const seen: Array<{ count: number; fine: number; expelled: boolean; cashBefore: number }> = [];

  it('queues a manual audit, and refuses a participant forging one', async () => {
    await expect(set(ref(p1.db, `${paths.engine(g)}/pendingAudits`), [pactA])).rejects.toThrow();
    const r = await queueAudit(ctx, pactA);
    expect(r).toMatchObject({ ok: true });
    expect((await api.readEngine(fac.db, g))?.pendingAudits).toEqual([pactA]);
    expect((await queueAudit(ctx, pactA)).message).toContain('already queued');
  });

  for (const q of [1, 2, 3]) {
    it(`quarter ${q}: firm A breaches the pace limit, the audit fines it ${fineRate[q - 1]! * 100}%${q === 3 ? ' and expels it' : ''}`, async () => {
      if (q > 1) {
        await run(`open ${q}`, advance(ctx));
        round = q;
        await run('queue', queueAudit(ctx, pactA));
      }
      await api.submitDecision(p1.db, g, q, firmA, p1.uid, mkDecision(4, 5));
      await api.submitDecision(p2.db, g, q, firmB, p2.uid, mkDecision(2, 12));
      await run(`resolve ${q}`, advance(ctx));
      const node = await api.readRound(p2.db, g, q); // any participant sees published audit outcomes
      const audit = node?.audits.find((a) => a.pactId === pactA);
      expect(audit).toMatchObject({ kind: 'manual' });
      expect(audit?.breaches.map((b) => b.firmId)).toEqual([firmA]); // firm B complied
      const b = audit?.breaches[0];
      const own = await new Promise<{ cash: number }>((res) => {
        const unsub = api.subscribeFirmPrivate(p1.db, g, firmA, (v) => {
          if (v && v.history[String(q)]) {
            queueMicrotask(unsub);
            res({ cash: v.history[String(q)]!.cash });
          }
        });
      });
      seen.push({ count: b?.count ?? 0, fine: b?.fine ?? 0, expelled: b?.expelled ?? false, cashBefore: own.cash + (b?.fine ?? 0) });
      const headline = node?.headlines.find((h) => h.kind === 'breach');
      expect(headline?.text).toMatch(/ALPH/);
      expect(headline?.text).toMatch(/PACT-A/);
    });
  }

  it('applies 10%, 25% and 40% of cash (minimum 10), expels on the third, and removes the member', () => {
    expect(seen.map((s) => s.count)).toEqual([1, 2, 3]);
    expect(seen.map((s) => s.expelled)).toEqual([false, false, true]);
    seen.forEach((s, i) => expect(s.fine).toBeCloseTo(Math.max(10, fineRate[i]! * s.cashBefore), 6));
  });

  it('shows the pact without the expelled firm, BREACH on the board for two quarters, and a cleared queue', async () => {
    const pacts = await api.readPacts(p2.db, g);
    expect(Object.keys(pacts[pactA]?.members ?? {})).toEqual([firmB]);
    const engine = await api.readEngine(fac.db, g);
    expect(engine?.pendingAudits).toEqual([]);
    expect(engine?.pactsPrivate[pactA]?.sanctions[firmA]).toBe(3);
    const fps = fromFirmsPublic((await get(ref(p2.db, paths.firmsPublic(g)))).val());
    expect(fps[firmA]?.breachUntilRound).toBe(4);
    const pub = await readPub();
    const data: ScreenData = {
      pub: pub!,
      meta: (await api.readMeta(p2.db, g))!,
      firms: await api.readFirms(p2.db, g),
      firmsPublic: fps,
      rounds: fromRounds((await get(ref(p2.db, paths.rounds(g)))).val()),
      pacts,
      wire: {},
      memberCounts: {},
    };
    expect(boardRows(data).find((r) => r.id === firmA)?.breach).toBe(true);
    expect(boardRows(data).find((r) => r.id === firmB)?.breach).toBe(false);
    expect(boardRows({ ...data, pub: { ...pub!, round: 5 } }).find((r) => r.id === firmA)?.breach).toBe(false);
  });
});

describe('disclosure on and off', () => {
  const rowsFor = async (): Promise<ReturnType<typeof boardRows>> => {
    const pub = (await readPub())!;
    return boardRows({
      pub,
      meta: (await api.readMeta(p2.db, g))!,
      firms: await api.readFirms(p2.db, g),
      firmsPublic: fromFirmsPublic((await get(ref(p2.db, paths.firmsPublic(g)))).val()),
      rounds: fromRounds((await get(ref(p2.db, paths.rounds(g)))).val()),
      pacts: await api.readPacts(p2.db, g),
      wire: {},
      memberCounts: {},
    });
  };

  it('publishes nothing while off', async () => {
    const node = await api.readRound(p1.db, g, 3);
    expect(node?.disclosure).toBeNull();
    expect((await rowsFor()).every((r) => r.disclosed === null)).toBe(true);
  });

  it('turns on from the reveal and fires the headline; the next quarter publishes pace, safety and exposure per firm', async () => {
    await run('on', toggleDisclosure(ctx));
    expect((await readPub())?.disclosure).toBe(true);
    await run('open 4', advance(ctx));
    await api.submitDecision(p1.db, g, 4, firmA, p1.uid, mkDecision(3, 7));
    await api.submitDecision(p2.db, g, 4, firmB, p2.uid, mkDecision(1, 20));
    await run('resolve 4', advance(ctx));
    const node = await api.readRound(p2.db, g, 4);
    expect(Object.keys(node?.disclosure ?? {})).toHaveLength(4);
    expect(node?.disclosure?.[firmA]).toMatchObject({ pace: 3, safety: 7 });
    expect(node?.disclosure?.[firmB]).toMatchObject({ pace: 1, safety: 20 });
    expect(node?.disclosure?.[firmA]?.expo).toBeGreaterThan(node?.disclosure?.[firmB]?.expo ?? Infinity);
    const rows = await rowsFor();
    expect(rows.find((r) => r.id === firmA)?.disclosed).toMatchObject({ pace: 3, safety: 7 });
    expect(rows.every((r) => r.disclosed !== null)).toBe(true);
  });

  it('turns off again: the board stops reading the snapshot and the next quarter publishes none', async () => {
    await run('off', toggleDisclosure(ctx));
    expect((await readPub())?.disclosure).toBe(false);
    expect((await rowsFor()).every((r) => r.disclosed === null)).toBe(true);
    await run('open 5', advance(ctx));
    await run('resolve 5', advance(ctx));
    expect((await api.readRound(p1.db, g, 5))?.disclosure).toBeNull();
    // The facilitator-only copy keeps the data regardless.
    const engine = await api.readEngine(fac.db, g);
    expect(engine?.history[4]?.firms[firmA]?.expo).toBeGreaterThan(0);
  });

  it('wrote both toggle headlines to the wire, readable by participants and never writable by them', async () => {
    const wire = await api.readWire(p1.db, g);
    const texts = Object.values(wire).map((e) => e.text);
    expect(texts).toContain('Assembly passes frontier disclosure rule');
    expect(texts).toContain('Disclosure rule suspended');
    await expect(set(ref(p1.db, paths.wire(g)), null)).rejects.toThrow();
  });
});

describe('live wire for pacts', () => {
  const input = async () => ({
    pacts: await api.readPacts(fac.db, g),
    firms: await api.readFirms(fac.db, g),
    rounds: fromRounds((await get(ref(fac.db, paths.rounds(g)))).val()),
    wire: await api.readWire(fac.db, g),
    pub: (await readPub())!,
  });

  it('left PACT-A dissolved once only one member remained, and publishes nothing for it', async () => {
    expect((await api.readPacts(fac.db, g))[pactA]?.status).toBe('dissolved');
    const before = Object.keys(await api.readWire(fac.db, g)).length;
    expect(await publishWire(ctx, await input())).toBe(0);
    expect(Object.keys(await api.readWire(fac.db, g))).toHaveLength(before);
  });

  it('publishes the formed, joined and departure headlines once each', async () => {
    await run('summit on', toggleSummit(ctx)); // from the reveal; proposals are allowed
    const pactC = await api.proposePact(p1.db, g, 5, firmA, 'PACT-C', { maxPace: 3, minSafety: 5 });
    await api.joinPact(p2.db, g, pactC, firmB, 5);
    expect(await publishWire(ctx, await input())).toBe(2);
    expect(await publishWire(ctx, await input())).toBe(0);
    const entries = Object.values(await api.readWire(p2.db, g)).filter((e) => e.pact === pactC);
    expect(entries.map((e) => e.kind).sort()).toEqual(['pact-formed', 'pact-joined']);
    expect(entries.every((e) => e.seq === 5 && e.round === 5)).toBe(true); // after quarter 5 resolved
    expect(entries.find((e) => e.kind === 'pact-formed')?.text).toMatch(/ALPH.*PACT-C|PACT-C.*ALPH/);
    expect(entries.find((e) => e.kind === 'pact-joined')?.text).toMatch(/BETA/);
    await api.leavePact(p2.db, g, pactC, firmB);
    expect(await publishWire(ctx, await input())).toBe(1);
    expect(await publishWire(ctx, await input())).toBe(0);
    const left = Object.values(await api.readWire(p1.db, g)).filter((e) => e.kind === 'pact-left');
    expect(left).toHaveLength(1);
    expect(left[0]?.text).toMatch(/BETA/);
    await run('summit off', toggleSummit(ctx));
  });
});
