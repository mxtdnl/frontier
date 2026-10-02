/**
 * Orchestrator behaviour (spec §4, §11) against an in-memory store that applies the same
 * normalisation as the database (nulls and empty containers vanish, arrays become maps).
 * The real database is covered in tests/emulator/orchestrator.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { PARAMS, buildResults, createGame, type Pact } from '../../src/engine';
import {
  INCOMPLETE,
  addTime,
  advance,
  autoResolve,
  buildEngineNode,
  deleteSession,
  endSession,
  ensureResults,
  mergePacts,
  publishResults,
  publishWire,
  queueAudit,
  resolveCurrentRound,
  resolveDue,
  retryResolution,
  seedFromText,
  setPaused,
  startBriefing,
  stepResults,
  toggleDisclosure,
  toggleSummit,
  type Ctx,
  type OrchestratorIO,
} from '../../src/firebase/orchestrator';
import {
  fromDecisions,
  fromEngine,
  fromFirmPrivate,
  fromFirms,
  fromMeta,
  fromPacts,
  fromResults,
  fromPublic,
  fromRound,
  fromWire,
  type EngineNode,
  type FirmNode,
  type PublicNode,
} from '../../src/firebase/schema';
import { engineStateOf } from '../../src/firebase/schema';
import { storeAndRead } from './rtdb';

type Json = Record<string, unknown>;

/** Writes `value` at a slash path inside `root`; null deletes. */
function setAt(root: Json, path: string, value: unknown): void {
  const parts = path.split('/');
  let node = root;
  for (const key of parts.slice(0, -1)) {
    const next = node[key];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) node[key] = {};
    node = node[key] as Json;
  }
  const last = parts[parts.length - 1] as string;
  if (value === null) delete node[last];
  else node[last] = structuredClone(value);
}

const getAt = (root: Json, path: string): unknown => path.split('/').reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Json)[k] : undefined), root);

interface World {
  ctx: Ctx;
  db: Json;
  clock: { t: number };
  updates: Array<Record<string, unknown>>;
  /** Rejects the next `n` multi-path updates. */
  failUpdates: { n: number };
  /** Runs once just before the next update, to simulate a concurrent write. */
  beforeUpdate: { fn: (() => void) | null };
  pub: () => PublicNode;
  engine: () => EngineNode;
  firmIds: string[];
}

interface Opts {
  humans?: number;
  bots?: Array<'cautious' | 'standard' | 'greedy' | 'mimic-leader'>;
  endMode?: 'manual' | 'random' | 'fixed';
  fixedEnd?: number;
  seed?: number;
  timerSec?: number;
  uid?: string;
}

function world(o: Opts = {}): World {
  const humans = o.humans ?? 2;
  const bots = o.bots ?? ['standard', 'greedy'];
  const seed = o.seed ?? 12345;
  const endMode = o.endMode ?? 'fixed';
  const firms: Record<string, unknown> = {};
  const firmIds: string[] = [];
  let created = 1000;
  bots.forEach((policy, i) => {
    const id = `bot${i}`;
    firmIds.push(id);
    firms[id] = { name: `Bot ${i}`, ticker: `BOT${String.fromCharCode(65 + i)}`, createdAt: created++, order: i, isBot: true, botPolicy: policy };
  });
  for (let i = 0; i < humans; i++) {
    const id = `hum${i}`;
    firmIds.push(id);
    firms[id] = { name: `Human ${i}`, ticker: `HUM${String.fromCharCode(65 + i)}`, createdAt: created++, order: i, isBot: false };
  }
  const settings = { label: 'ABCD', endMode, minEnd: 10, maxEnd: 14, fixedEnd: endMode === 'fixed' ? (o.fixedEnd ?? 3) : null, disclosure: false, autoAuditP: 0.25 };
  const state = createGame(settings, [], seed, PARAMS);
  const db: Json = {
    meta: { code: 'ABCD', title: 'Session ABCD', createdAt: 1, facilitatorUid: 'fac', settings: { timerSec: o.timerSec ?? 120, autoResolve: false, revealThreshold: false, litRoom: false } },
    public: {
      phase: 'lobby', round: 0, paused: false, disclosure: false, T: state.T, M: 0, collapsed: false, joinLocked: false, revealStep: 0,
    },
    firms,
    engine: { ...state, params: PARAMS },
  };
  const clock = { t: 1_000_000 };
  const updates: Array<Record<string, unknown>> = [];
  const failUpdates = { n: 0 };
  const beforeUpdate: { fn: (() => void) | null } = { fn: null };
  const io: OrchestratorIO = {
    async transactPublic(step) {
      const current = fromPublic(storeAndRead(db.public));
      if (!current) return { committed: false, value: null };
      const next = step(current);
      if (next === undefined) return { committed: false, value: current };
      setAt(db, 'public', storeAndRead(next) ?? {});
      return { committed: true, value: fromPublic(storeAndRead(next)) };
    },
    readPublic: async () => fromPublic(storeAndRead(db.public)),
    readMeta: async () => fromMeta(storeAndRead(db.meta)),
    readEngine: async () => fromEngine(storeAndRead(db.engine)),
    readFirms: async () => fromFirms(storeAndRead(db.firms)),
    readDecisions: async (r) => fromDecisions(storeAndRead(getAt(db, `decisions/${r}`))),
    readPacts: async () => fromPacts(storeAndRead(db.pacts)),
    readResults: async () => fromResults(storeAndRead(db.results)),
    async deleteGame() {
      for (const k of Object.keys(db)) delete db[k];
    },
    async transactPendingAudits(step) {
      const engine = fromEngine(storeAndRead(db.engine));
      const current = engine?.pendingAudits ?? [];
      const next = step(current);
      if (next === undefined) return { committed: false, value: current };
      setAt(db, 'engine/pendingAudits', next.length ? next : null);
      return { committed: true, value: next };
    },
    async update(patch) {
      if (failUpdates.n > 0) {
        failUpdates.n--;
        throw new Error('write refused');
      }
      const hook = beforeUpdate.fn;
      beforeUpdate.fn = null;
      hook?.();
      updates.push(patch);
      for (const [path, value] of Object.entries(patch)) setAt(db, path, storeAndRead(value) ?? null);
    },
  };
  const ctx: Ctx = { io, uid: o.uid ?? 'fac', windowId: 'w1', now: () => clock.t };
  return {
    ctx, db, clock, updates, failUpdates, beforeUpdate,
    pub: () => fromPublic(storeAndRead(db.public)) as PublicNode,
    engine: () => fromEngine(storeAndRead(db.engine)) as EngineNode,
    firmIds,
  };
}

const commit = (w: World, round: number, firm: string, d: { pace: number; safety: number; card?: string; target?: string | null }): void =>
  setAt(w.db, `decisions/${round}/${firm}`, { pace: d.pace, safety: d.safety, card: d.card ?? 'NONE', ...(d.target ? { target: d.target } : {}), by: 'u1', at: 5 });

async function toOpen(w: World): Promise<void> {
  expect((await advance(w.ctx)).ok).toBe(true); // briefing
  expect((await advance(w.ctx)).ok).toBe(true); // open 1
}

describe('engine set-up at the briefing', () => {
  it('keeps τ and the end round from creation, and orders firms by creation time', async () => {
    const w = world({ seed: 777 });
    const before = w.engine();
    expect(before.firms).toHaveLength(0);
    const r = await advance(w.ctx);
    expect(r.ok).toBe(true);
    const after = w.engine();
    expect(after.tau).toBe(before.tau);
    expect(after.endRound).toBe(before.endRound);
    expect(after.firms.map((f) => f.id)).toEqual(['bot0', 'bot1', 'hum0', 'hum1']);
    expect(after.firms.map((f) => f.order)).toEqual([0, 1, 2, 3]);
    expect(w.pub().phase).toBe('briefing');
    expect(w.pub().joinLocked).toBe(true);
    expect(w.pub().M).toBeGreaterThan(0);
  });

  it('draws the same τ with the firms present as with none (setup stream is independent of firms)', () => {
    const settings = { label: 'ABCD', endMode: 'random' as const, minEnd: 10, maxEnd: 14, fixedEnd: null, disclosure: false, autoAuditP: 0.25 };
    const inits = ['a', 'b', 'c'].map((id) => ({ id, ticker: id.toUpperCase().repeat(3), isBot: false, botPolicy: null }));
    for (const seed of [1, 2, 99, 4242]) {
      const empty = createGame(settings, [], seed, PARAMS);
      const full = createGame(settings, inits, seed, PARAMS);
      expect(full.tau).toBe(empty.tau);
      expect(full.endRound).toBe(empty.endRound);
    }
  });

  it('buildEngineNode copies τ and the end round exactly', () => {
    const w = world({ endMode: 'random', seed: 31 });
    const prev = w.engine();
    const firms = fromFirms(storeAndRead(w.db.firms)) as Record<string, FirmNode>;
    const built = buildEngineNode(prev, firms);
    expect(built.tau).toBe(prev.tau);
    expect(built.endRound).toBe(prev.endRound);
    expect(built.seed).toBe(prev.seed);
  });

  it('refuses to start with fewer than two firms, without locking joins', async () => {
    const w = world({ humans: 1, bots: [] });
    const r = await startBriefing(w.ctx);
    expect(r.ok).toBe(false);
    expect(w.pub().phase).toBe('lobby');
    expect(w.pub().joinLocked).toBe(false);
  });
});

describe('phase machine', () => {
  it('runs lobby → briefing → open → reveal → open → … → ended at the hidden end round', async () => {
    const w = world({ endMode: 'fixed', fixedEnd: 2 });
    await toOpen(w);
    expect(w.pub().phase).toBe('open');
    expect(w.pub().round).toBe(1);
    expect(w.pub().deadline).toBe(w.clock.t + 120_000);
    expect((await advance(w.ctx)).ok).toBe(true); // force resolve
    expect(w.pub().phase).toBe('reveal');
    expect(w.engine().round).toBe(1);
    expect((await advance(w.ctx)).ok).toBe(true);
    expect(w.pub().phase).toBe('open');
    expect(w.pub().round).toBe(2);
    expect((await advance(w.ctx)).ok).toBe(true); // resolve round 2
    expect((await advance(w.ctx)).ok).toBe(true); // reveal after the end round → ended
    expect(w.pub().phase).toBe('ended');
    expect(w.pub().endedAt).toBe(w.clock.t);
    // F9 on an ended session steps the results panels instead (§14.4).
    expect((await advance(w.ctx)).ok).toBe(true);
    expect(w.pub().revealStep).toBe(1);
  });

  it('stops after round 30 in manual mode', async () => {
    const w = world({ endMode: 'manual', bots: ['cautious', 'cautious'], humans: 0 });
    await toOpen(w);
    for (let r = 1; r <= 30; r++) {
      expect(w.pub().round).toBe(r);
      expect((await advance(w.ctx)).ok).toBe(true); // resolve
      expect(w.pub().phase).toBe('reveal');
      expect((await advance(w.ctx)).ok).toBe(true); // next or ended
    }
    expect(w.pub().phase).toBe('ended');
    expect(w.engine().round).toBe(30);
  });

  it('refuses a stale advance (double press or second window)', async () => {
    const w = world();
    const seen = { phase: 'lobby' as const, round: 0 };
    expect((await advance(w.ctx, seen)).ok).toBe(true);
    const second = await advance(w.ctx, seen);
    expect(second.ok).toBe(false);
    expect(w.pub().phase).toBe('briefing');
  });

  it('summit freezes the timer and restores the remaining time', async () => {
    const w = world();
    await toOpen(w);
    w.clock.t += 50_000;
    expect((await toggleSummit(w.ctx)).ok).toBe(true);
    expect(w.pub()).toMatchObject({ phase: 'summit', resumePhase: 'open', paused: true, pausedRemainingMs: 70_000, deadline: null });
    w.clock.t += 600_000;
    expect((await advance(w.ctx)).ok).toBe(false);
    expect((await toggleSummit(w.ctx)).ok).toBe(true);
    expect(w.pub()).toMatchObject({ phase: 'open', paused: false, resumePhase: null, deadline: w.clock.t + 70_000 });
  });

  it('summit from a reveal returns to the reveal', async () => {
    const w = world();
    await toOpen(w);
    await advance(w.ctx);
    expect((await toggleSummit(w.ctx)).ok).toBe(true);
    expect(w.pub().phase).toBe('summit');
    expect((await toggleSummit(w.ctx)).ok).toBe(true);
    expect(w.pub().phase).toBe('reveal');
  });

  it('adds, removes and pauses time', async () => {
    const w = world();
    await toOpen(w);
    expect((await addTime(w.ctx, 30_000)).ok).toBe(true);
    expect(w.pub().deadline).toBe(w.clock.t + 150_000);
    expect((await addTime(w.ctx, -200_000)).ok).toBe(true);
    expect(w.pub().deadline).toBe(w.clock.t);
    expect((await addTime(w.ctx, 90_000)).ok).toBe(true);
    expect((await setPaused(w.ctx, true)).ok).toBe(true);
    expect(w.pub()).toMatchObject({ paused: true, deadline: null, pausedRemainingMs: 90_000 });
    expect((await addTime(w.ctx, 30_000)).ok).toBe(true);
    expect(w.pub().pausedRemainingMs).toBe(120_000);
    w.clock.t += 10_000;
    expect((await setPaused(w.ctx, false)).ok).toBe(true);
    expect(w.pub()).toMatchObject({ paused: false, deadline: w.clock.t + 120_000, pausedRemainingMs: null });
  });

  it('ends early from an open quarter without resolving it', async () => {
    const w = world();
    await toOpen(w);
    const r = await endSession(w.ctx);
    expect(r).toMatchObject({ ok: true });
    expect(w.pub().phase).toBe('ended');
    expect(w.engine().round).toBe(0);
  });

  it('cannot end before the first quarter opens', async () => {
    const w = world();
    expect((await endSession(w.ctx)).ok).toBe(false);
  });
});

describe('resolution lock (spec §11 step 1)', () => {
  it('lets exactly one of two simultaneous resolves run', async () => {
    const w = world();
    await toOpen(w);
    const writes = w.updates.length;
    const [a, b] = await Promise.all([resolveCurrentRound(w.ctx, 1), resolveCurrentRound(w.ctx, 1)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(w.updates.length).toBe(writes + 1);
    expect(w.engine().round).toBe(1);
    expect(w.pub().phase).toBe('reveal');
  });

  it('refuses a resolve for the wrong round', async () => {
    const w = world();
    await toOpen(w);
    const r = await resolveCurrentRound(w.ctx, 2);
    expect(r.ok).toBe(false);
    expect(w.pub().phase).toBe('open');
  });

  it('refuses to resolve a quarter that is not open', async () => {
    const w = world();
    await advance(w.ctx); // briefing
    expect((await resolveCurrentRound(w.ctx, 0)).ok).toBe(false);
  });
});

describe('resolution write and retry (spec §11 steps 4–5)', () => {
  it('writes every node in one update and ends in reveal', async () => {
    const w = world();
    await toOpen(w);
    const before = w.updates.length;
    await advance(w.ctx);
    expect(w.updates.length).toBe(before + 1);
    const patch = w.updates[w.updates.length - 1] as Record<string, unknown>;
    const keys = Object.keys(patch);
    for (const prefix of ['engine', 'rounds/1', 'firmsPrivate/hum0/cash', 'firmsPrivate/hum0/history/1', 'firmsPublic/hum0/share', 'public/phase']) {
      expect(keys.some((k) => k === prefix || k.startsWith(prefix))).toBe(true);
    }
    expect(w.pub()).toMatchObject({ phase: 'reveal', resolvingBy: null, deadline: null });
    const e = w.engine();
    expect(w.pub().T).toBe(e.T);
    expect(w.pub().M).toBe(e.M);
    const round = getAt(w.db, 'rounds/1') as Json;
    expect(Object.keys(round.results as Json).sort()).toEqual([...w.firmIds].sort());
  });

  it('keeps hidden values out of every node a participant can read', async () => {
    const w = world({ endMode: 'random' });
    await toOpen(w);
    await advance(w.ctx);
    const e = w.engine();
    for (const node of ['public', 'meta', 'firms', 'firmsPublic', 'rounds', 'pacts']) {
      const text = JSON.stringify(w.db[node] ?? null);
      expect(text).not.toContain('"tau"');
      expect(text).not.toContain('endRound');
      expect(text).not.toContain(String(e.tau));
    }
  });

  it('leaves the quarter in RESOLVING with nothing written when the update fails, then retry succeeds', async () => {
    const w = world();
    await toOpen(w);
    const snapshot = JSON.stringify(w.db);
    w.failUpdates.n = 1;
    const r = await advance(w.ctx);
    expect(r).toEqual({ ok: false, message: INCOMPLETE });
    expect(w.pub().phase).toBe('resolving');
    expect(w.pub().resolvingBy).toBe('fac');
    // Only the lock (public) changed.
    const after = JSON.parse(JSON.stringify(w.db)) as Json;
    (after.public as Json).phase = 'open';
    delete (after.public as Json).resolvingBy;
    expect(JSON.stringify(after)).toBe(snapshot);
    expect(w.engine().round).toBe(0);

    const retry = await retryResolution(w.ctx, 'fac');
    expect(retry.ok).toBe(true);
    expect(w.pub().phase).toBe('reveal');
    expect(w.engine().round).toBe(1);
  });

  it('survives repeated failures and the retry result equals a clean run', async () => {
    const clean = world();
    await toOpen(clean);
    commit(clean, 1, 'hum0', { pace: 3, safety: 5 });
    await advance(clean.ctx);

    const w = world();
    await toOpen(w);
    commit(w, 1, 'hum0', { pace: 3, safety: 5 });
    w.failUpdates.n = 2;
    await advance(w.ctx);
    const first = await retryResolution(w.ctx, 'fac');
    expect(first).toEqual({ ok: false, message: INCOMPLETE });
    expect((await retryResolution(w.ctx, 'fac#w1')).ok).toBe(true);
    expect(JSON.stringify(w.db.engine)).toBe(JSON.stringify(clean.db.engine));
  });

  it('lets only one of two windows retry together', async () => {
    const w = world();
    await toOpen(w);
    w.failUpdates.n = 1;
    await advance(w.ctx);
    const other: Ctx = { ...w.ctx, windowId: 'w2' };
    const [a, b] = await Promise.all([retryResolution(w.ctx, 'fac'), retryResolution(other, 'fac')]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(w.engine().round).toBe(1);
  });

  it('refuses a retry once the quarter is revealed', async () => {
    const w = world();
    await toOpen(w);
    await advance(w.ctx);
    expect((await retryResolution(w.ctx, null)).ok).toBe(false);
    expect(w.engine().round).toBe(1);
  });

  it('does not resolve twice if a concurrent window finished first', async () => {
    const w = world();
    await toOpen(w);
    w.failUpdates.n = 1;
    await advance(w.ctx);
    // Another window completes the quarter between our read and our write.
    const other: Ctx = { ...w.ctx, windowId: 'w2' };
    const done = await retryResolution(other, 'fac');
    expect(done.ok).toBe(true);
    const late = await retryResolution(w.ctx, 'fac');
    expect(late.ok).toBe(false);
    expect(w.engine().round).toBe(1);
  });
});

describe('decisions, defaults and bots', () => {
  it('uses committed decisions, flags missing human firms AUTO, and runs bots from policy', async () => {
    const w = world({ bots: ['cautious', 'greedy'], humans: 2 });
    await toOpen(w);
    commit(w, 1, 'hum0', { pace: 4, safety: 0 });
    await advance(w.ctx);
    const e = w.engine();
    const h = e.history[0];
    expect(h?.firms.hum0).toMatchObject({ pace: 4, safety: 0, auto: false });
    expect(h?.firms.hum1).toMatchObject({ pace: PARAMS.DEFAULT_PACE, safety: PARAMS.DEFAULT_SAFETY, auto: true });
    expect(h?.firms.bot0?.auto).toBe(false);
    expect(h?.firms.bot0?.pace).toBe(PARAMS.BOT_CAUTIOUS.pace);
    expect(getAt(w.db, 'firmsPublic/hum1/auto')).toBe(true);
    expect(getAt(w.db, 'firmsPublic/hum0/submittedRound')).toBe(1);
    expect(getAt(w.db, 'firmsPublic/bot0/submittedRound')).toBe(1);
    expect(getAt(w.db, 'firmsPublic/hum1/submittedRound') ?? 0).toBe(0);
  });

  it('ignores decisions from firms that do not exist', async () => {
    const w = world();
    await toOpen(w);
    commit(w, 1, 'ghost', { pace: 4, safety: 0 });
    expect((await advance(w.ctx)).ok).toBe(true);
    expect(Object.keys(w.engine().history[0]?.firms ?? {})).not.toContain('ghost');
  });

  it('matches the pure engine on the same inputs', async () => {
    const w = world({ seed: 99 });
    await toOpen(w);
    commit(w, 1, 'hum0', { pace: 3, safety: 12, card: 'BLITZ' });
    commit(w, 1, 'hum1', { pace: 1, safety: 20 });
    const state = engineStateOf(w.engine());
    const direct = (await import('../../src/engine')).resolveRound(
      state,
      { hum0: { pace: 3, safety: 12, card: 'BLITZ', target: null }, hum1: { pace: 1, safety: 20, card: 'NONE', target: null } },
      PARAMS,
    );
    await advance(w.ctx);
    expect(w.engine().T).toBeCloseTo(direct.state.T, 9);
    expect(w.engine().firms.map((f) => f.valuation)).toEqual(direct.state.firms.map((f) => f.valuation));
  });
});

describe('pacts written by participants', () => {
  const pact = (over: Partial<Pact> = {}): Pact => ({
    id: 'p1', name: 'PACT-A', proposer: 'hum0', terms: { maxPace: 2, minSafety: null }, members: { hum0: 1, hum1: 1 }, createdRound: 1, status: 'active', ...over,
  });

  it('adds a pact created during the quarter to the engine, with an empty private record', async () => {
    const w = world();
    await toOpen(w);
    setAt(w.db, 'pacts/p1', { name: 'PACT-A', proposer: 'hum0', terms: { maxPace: 2 }, members: { hum0: 1, hum1: 1 }, createdRound: 1, status: 'active' });
    commit(w, 1, 'hum0', { pace: 3, safety: 5 });
    await advance(w.ctx);
    const e = w.engine();
    expect(e.pacts.map((p) => p.id)).toEqual(['p1']);
    expect(e.pactsPrivate.p1?.violations['1']?.hum0).toBe(true);
    expect(getAt(w.db, 'pactsPrivate/p1')).toBeTruthy();
  });

  it('mergePacts takes live membership for known pacts and appends new ones in creation order', () => {
    const state = createGame({ label: 'ABCD', endMode: 'manual', minEnd: 1, maxEnd: 1, fixedEnd: null, disclosure: false, autoAuditP: 0 }, [], 1, PARAMS);
    state.pacts = [pact({ id: 'old', name: 'PACT-A', members: { hum0: 1, hum1: 1 }, createdRound: 1 })];
    mergePacts(state, {
      old: pact({ id: 'old', members: { hum0: 1 } }),
      zed: pact({ id: 'zed', name: 'PACT-C', createdRound: 2 }),
      bee: pact({ id: 'bee', name: 'PACT-B', createdRound: 2 }),
    });
    expect(state.pacts.map((p) => p.id)).toEqual(['old', 'bee', 'zed']);
    expect(state.pacts[0]?.members).toEqual({ hum0: 1 });
    expect(Object.keys(state.pactsPrivate).sort()).toEqual(['bee', 'zed']);
  });

  it('does not reopen a dissolved pact from live membership', () => {
    const state = createGame({ label: 'ABCD', endMode: 'manual', minEnd: 1, maxEnd: 1, fixedEnd: null, disclosure: false, autoAuditP: 0 }, [], 1, PARAMS);
    state.pacts = [pact({ status: 'dissolved', members: {} })];
    mergePacts(state, { p1: pact({ members: { hum0: 3 } }) });
    expect(state.pacts[0]?.members).toEqual({});
  });
});

describe('auto-resolve', () => {
  it('is due only after the deadline plus the grace window', async () => {
    const w = world();
    await toOpen(w);
    const pub = w.pub();
    expect(resolveDue(pub, (pub.deadline ?? 0) + 3000)).toBe(false);
    expect(resolveDue(pub, (pub.deadline ?? 0) + 3300)).toBe(true);
    expect(resolveDue({ ...pub, paused: true }, (pub.deadline ?? 0) + 99_999)).toBe(false);
    expect(resolveDue({ ...pub, phase: 'reveal' }, (pub.deadline ?? 0) + 99_999)).toBe(false);
    expect(resolveDue(null, 0)).toBe(false);
  });

  it('resolves once even when called from two windows', async () => {
    const w = world();
    await toOpen(w);
    w.clock.t += 120_000 + 3300;
    const other: Ctx = { ...w.ctx, windowId: 'w2' };
    const results = await Promise.all([autoResolve(w.ctx), autoResolve(other)]);
    expect(results.filter((r) => r?.ok === true)).toHaveLength(1);
    expect(w.engine().round).toBe(1);
  });

  it('does nothing before the deadline', async () => {
    const w = world();
    await toOpen(w);
    expect(await autoResolve(w.ctx)).toBeNull();
    expect(w.pub().phase).toBe('open');
  });
});

describe('seed text', () => {
  it('uses whole numbers as they are and hashes other text', () => {
    expect(seedFromText('42')).toBe(42);
    expect(seedFromText(' 7 ')).toBe(7);
    expect(seedFromText('rehearsal')).toBe(seedFromText('rehearsal'));
    expect(seedFromText('rehearsal')).not.toBe(seedFromText('rehearsal2'));
  });
});

// ── Session 6: pacts, audits, cards, disclosure, wire ──────────────────────────

const PACT_NODE = { name: 'PACT-A', proposer: 'hum0', terms: { maxPace: 2 }, members: { hum0: 1, hum1: 1 }, createdRound: 1, status: 'active' };
const roundNode = (w: World, r: number) => fromRound(storeAndRead(getAt(w.db, `rounds/${r}`)));
const firmPriv = (w: World, f: string) => fromFirmPrivate(storeAndRead(getAt(w.db, `firmsPrivate/${f}`)));
const wireOf = (w: World) => fromWire(storeAndRead(w.db.wire));
const liveInput = (w: World) => ({
  pacts: fromPacts(storeAndRead(w.db.pacts)),
  firms: fromFirms(storeAndRead(w.db.firms)),
  rounds: {},
  wire: wireOf(w),
  pub: w.pub(),
});

describe('disclosure toggle (F7, spec §9.3)', () => {
  it('flips in any phase and publishes the matching headline each time', async () => {
    const w = world();
    expect((await toggleDisclosure(w.ctx)).ok).toBe(true);
    expect(w.pub().disclosure).toBe(true);
    expect(Object.values(wireOf(w)).map((e) => [e.kind, e.text])).toEqual([['disclosure-on', 'Assembly passes frontier disclosure rule']]);
    w.clock.t += 1000;
    await toOpen(w);
    w.clock.t += 1000;
    expect((await toggleDisclosure(w.ctx)).ok).toBe(true);
    expect(w.pub().disclosure).toBe(false);
    const kinds = Object.values(wireOf(w)).sort((a, b) => a.at - b.at).map((e) => e.kind);
    expect(kinds).toEqual(['disclosure-on', 'disclosure-off']);
  });

  it('refuses after the session ends and when the caller looked at an older phase', async () => {
    const w = world();
    expect((await toggleDisclosure(w.ctx, { phase: 'briefing', round: 0 })).ok).toBe(false);
    await toOpen(w);
    await endSession(w.ctx);
    expect((await toggleDisclosure(w.ctx)).ok).toBe(false);
    expect(w.pub().disclosure).toBe(false);
  });

  it('publishes {pace, safety, expo} per firm in the round node only while it is on', async () => {
    const w = world();
    await toggleDisclosure(w.ctx);
    await toOpen(w);
    commit(w, 1, 'hum0', { pace: 3, safety: 12 });
    await advance(w.ctx);
    const on = roundNode(w, 1)?.disclosure;
    expect(Object.keys(on ?? {}).sort()).toEqual(['bot0', 'bot1', 'hum0', 'hum1']);
    expect(on?.hum0).toMatchObject({ pace: 3, safety: 12 });
    expect(on?.hum0?.expo).toBeGreaterThan(0);
    await toggleDisclosure(w.ctx);
    await advance(w.ctx);
    await advance(w.ctx);
    expect(roundNode(w, 2)?.disclosure).toBeNull();
    // The facilitator-only copy keeps the data either way.
    expect(w.engine().history[1]?.firms.hum0?.expo).toBeGreaterThan(0);
  });
});

describe('manual audit queue (F6, spec §9.2)', () => {
  it('queues a pact once and refuses outside open, reveal and summit', async () => {
    const w = world();
    setAt(w.db, 'pacts/p1', PACT_NODE);
    expect((await queueAudit(w.ctx, 'p1')).ok).toBe(false); // lobby
    await toOpen(w);
    expect((await queueAudit(w.ctx, 'p1')).message).toContain('queued');
    expect(w.engine().pendingAudits).toEqual(['p1']);
    const again = await queueAudit(w.ctx, 'p1');
    expect(again).toMatchObject({ ok: true });
    expect(again.message).toContain('already queued');
    expect(w.engine().pendingAudits).toEqual(['p1']);
    expect((await queueAudit(w.ctx, 'nope')).ok).toBe(false);
    setAt(w.db, 'pacts/p2', { ...PACT_NODE, name: 'PACT-B', status: 'dissolved', members: { hum0: 1 } });
    expect((await queueAudit(w.ctx, 'p2')).ok).toBe(false);
  });

  it('runs at the next resolution and clears the queue', async () => {
    const w = world();
    await toOpen(w);
    setAt(w.db, 'pacts/p1', PACT_NODE);
    commit(w, 1, 'hum0', { pace: 4, safety: 5 });
    commit(w, 1, 'hum1', { pace: 2, safety: 10 });
    await queueAudit(w.ctx, 'p1');
    await advance(w.ctx);
    expect(w.engine().pendingAudits).toEqual([]);
    const audit = roundNode(w, 1)?.audits[0];
    expect(audit).toMatchObject({ pactId: 'p1', kind: 'manual' });
    expect(audit?.breaches.map((b) => b.firmId)).toEqual(['hum0']);
  });
});

describe('graduated sanctions across three audited violations', () => {
  it('fines 10%, 25%, 40% (minimum 10), expels on the third and removes the member from the pact', async () => {
    const w = world({ endMode: 'manual' });
    await toOpen(w);
    setAt(w.db, 'pacts/p1', PACT_NODE);
    const fines: Array<{ count: number; fine: number; cashBefore: number; expelled: boolean }> = [];
    for (let r = 1; r <= 3; r++) {
      commit(w, r, 'hum0', { pace: 4, safety: 5 });
      commit(w, r, 'hum1', { pace: 2, safety: 10 });
      await queueAudit(w.ctx, 'p1');
      await advance(w.ctx); // resolve
      const b = roundNode(w, r)?.audits[0]?.breaches[0];
      expect(b?.firmId).toBe('hum0');
      const res = w.engine().history[r - 1]?.firms.hum0;
      fines.push({ count: b?.count ?? 0, fine: b?.fine ?? 0, cashBefore: (res?.cash ?? 0) + (b?.fine ?? 0), expelled: b?.expelled ?? false });
      if (r < 3) await advance(w.ctx); // next quarter
    }
    expect(fines.map((f) => f.count)).toEqual([1, 2, 3]);
    expect(fines.map((f) => f.expelled)).toEqual([false, false, true]);
    [0.1, 0.25, 0.4].forEach((rate, i) => {
      const f = fines[i];
      expect(f?.fine).toBeCloseTo(Math.max(10, rate * (f?.cashBefore ?? 0)), 6);
    });
    expect(Object.keys(fromPacts(storeAndRead(w.db.pacts)).p1?.members ?? {})).toEqual(['hum1']);
    expect(w.engine().pactsPrivate.p1?.sanctions.hum0).toBe(3);
    // BREACH shows for two quarters from detection (§9.2): through round 4.
    expect(w.engine().firms.find((f) => f.id === 'hum0')?.breachUntilRound).toBe(4);
    const fp = storeAndRead(getAt(w.db, 'firmsPublic/hum0')) as { breachUntilRound: number };
    expect(fp.breachUntilRound).toBe(4);
  });

  it('waives the fine, but not the publication, when the firm played LOBBY that quarter', async () => {
    const w = world();
    await toOpen(w);
    setAt(w.db, 'pacts/p1', PACT_NODE);
    commit(w, 1, 'hum0', { pace: 4, safety: 5, card: 'LOBBY' });
    commit(w, 1, 'hum1', { pace: 2, safety: 10 });
    await queueAudit(w.ctx, 'p1');
    await advance(w.ctx);
    const b = roundNode(w, 1)?.audits[0]?.breaches[0];
    expect(b).toMatchObject({ firmId: 'hum0', waived: true, fine: 0, count: 1 });
    expect(roundNode(w, 1)?.headlines.some((h) => h.kind === 'breach' && h.text.includes('fine waived'))).toBe(true);
  });
});

describe('cards end to end', () => {
  it('POACH moves capability from the target to the player', async () => {
    const w = world();
    await toOpen(w);
    commit(w, 1, 'hum0', { pace: 2, safety: 10, card: 'POACH', target: 'hum1' });
    commit(w, 1, 'hum1', { pace: 2, safety: 10 });
    await advance(w.ctx);
    const [a, b] = ['hum0', 'hum1'].map((id) => w.engine().firms.find((f) => f.id === id)?.cap ?? 0);
    expect((a ?? 0) - (b ?? 0)).toBeCloseTo(6, 6);
    expect(firmPriv(w, 'hum0')?.lastCard).toBe('POACH');
    expect(firmPriv(w, 'hum0')?.lastPoachTarget).toBe('hum1');
    expect(firmPriv(w, 'hum0')?.notices).toEqual({});
  });

  it('stores a private notice when a card is dropped: cooldown, repeated target, missing target', async () => {
    const w = world({ endMode: 'manual' });
    await toOpen(w);
    commit(w, 1, 'hum0', { pace: 2, safety: 10, card: 'POACH', target: 'hum1' });
    commit(w, 1, 'hum1', { pace: 2, safety: 10, card: 'POACH' }); // no target
    await advance(w.ctx);
    expect(firmPriv(w, 'hum1')?.notices['1']).toEqual([{ kind: 'card-target', card: 'POACH' }]);
    expect(firmPriv(w, 'hum0')?.notices['1']).toBeUndefined();
    await advance(w.ctx);
    commit(w, 2, 'hum0', { pace: 2, safety: 10, card: 'POACH', target: 'bot0' }); // played last quarter
    await advance(w.ctx);
    expect(firmPriv(w, 'hum0')?.notices['2']).toEqual([{ kind: 'card-cooldown', card: 'POACH' }]);
    await advance(w.ctx);
    commit(w, 3, 'hum0', { pace: 2, safety: 10, card: 'BLITZ' });
    await advance(w.ctx);
    await advance(w.ctx);
    commit(w, 4, 'hum0', { pace: 2, safety: 10, card: 'POACH', target: 'hum1' }); // same target as round 1
    await advance(w.ctx);
    expect(firmPriv(w, 'hum0')?.notices['4']).toEqual([{ kind: 'card-target-repeat', card: 'POACH' }]);
    // The dropped card never counted as played.
    expect(firmPriv(w, 'hum0')?.lastCard).toBe('NONE');
  });

  it('never exposes one firm\'s notices in a node another firm can read', async () => {
    const w = world();
    await toOpen(w);
    commit(w, 1, 'hum1', { pace: 2, safety: 10, card: 'POACH' });
    await advance(w.ctx);
    for (const node of ['public', 'rounds', 'firmsPublic', 'firms', 'pacts', 'wire']) {
      expect(JSON.stringify(storeAndRead(w.db[node]) ?? null)).not.toContain('card-target');
    }
  });
});

describe('live wire headlines (spec §5.3)', () => {
  it('publishes a formed and a joined headline once, however many windows run it', async () => {
    const w = world();
    await toOpen(w);
    setAt(w.db, 'pacts/p1', { ...PACT_NODE, members: { hum0: 1 } });
    expect(await publishWire(w.ctx, liveInput(w))).toBe(1);
    expect(await publishWire(w.ctx, liveInput(w))).toBe(0);
    setAt(w.db, 'pacts/p1/members/hum1', 1);
    expect(await publishWire(w.ctx, liveInput(w))).toBe(1);
    const texts = Object.values(wireOf(w)).map((e) => e.text);
    expect(texts.some((t) => t.includes('HUMA') && t.includes('PACT-A'))).toBe(true);
    expect(texts.some((t) => t.includes('HUMB') && t.includes('PACT-A'))).toBe(true);
    // A window with a stale copy of the wire writes the same keys, not new ones.
    const stale = { ...liveInput(w), wire: {} };
    await publishWire(w.ctx, stale);
    expect(Object.keys(wireOf(w))).toHaveLength(2);
  });

  it('publishes a departure when a member leaves, once, and none for an expulsion', async () => {
    const w = world();
    await toOpen(w);
    setAt(w.db, 'pacts/p1', PACT_NODE);
    await publishWire(w.ctx, liveInput(w));
    setAt(w.db, 'pacts/p1/members/hum1', null);
    expect(await publishWire(w.ctx, liveInput(w))).toBe(1);
    expect(await publishWire(w.ctx, liveInput(w))).toBe(0);
    expect(Object.values(wireOf(w)).filter((e) => e.kind === 'pact-left')).toHaveLength(1);
    // hum0 removed by an expulsion that an audit published: no departure headline.
    setAt(w.db, 'pacts/p1/members/hum0', null);
    const expelledRound = fromRound({
      T: 70, dT: 0, M: 1, incidents: 0, headlines: [], disclosure: null, results: {},
      audits: [{ pactId: 'p1', kind: 'auto', rounds: [1], breaches: [{ firmId: 'hum0', rounds: [1], count: 3, fine: 10, waived: false, expelled: true }] }],
    });
    const input = { ...liveInput(w), rounds: { '1': expelledRound as NonNullable<typeof expelledRound> } };
    expect(await publishWire(w.ctx, input)).toBe(0);
  });

  it('labels an event by the quarter it belongs to', async () => {
    const w = world();
    await toOpen(w);
    setAt(w.db, 'pacts/p1', PACT_NODE);
    await publishWire(w.ctx, liveInput(w));
    const e = Object.values(wireOf(w));
    expect(e.every((x) => x.round === 1 && x.seq === 0.5)).toBe(true);
    await advance(w.ctx);
    setAt(w.db, 'pacts/p1/members/hum1', null);
    await publishWire(w.ctx, liveInput(w));
    expect(Object.values(wireOf(w)).find((x) => x.kind === 'pact-left')?.seq).toBe(1);
  });
});

describe('results (spec §10, §14.4)', () => {
  async function ended(o: Opts & { revealTau?: boolean } = {}): Promise<World> {
    const w = world({ endMode: 'fixed', fixedEnd: 3, ...o });
    if (o.revealTau) setAt(w.db, 'meta/settings/revealThreshold', true);
    await toOpen(w);
    for (let r = 1; r <= 3; r++) {
      if (r > 1) await advance(w.ctx); // open the next quarter
      for (const id of w.firmIds.filter((f) => f.startsWith('hum'))) commit(w, r, id, { pace: 3, safety: 4 });
      expect((await advance(w.ctx)).ok).toBe(true); // resolve
    }
    expect((await advance(w.ctx)).ok).toBe(true); // reveal after the end round → ended
    return w;
  }
  const stored = (w: World) => fromResults(storeAndRead(w.db.results));

  it('writes /results when the session ends, equal to the engine output for the stored state', async () => {
    const w = await ended();
    expect(w.pub().phase).toBe('ended');
    const expected = buildResults(engineStateOf(w.engine()), { revealTau: false }, PARAMS);
    expect(stored(w)).toEqual(fromResults(storeAndRead(expected)));
    expect(stored(w)?.rounds).toBe(3);
    expect(w.updates.filter((u) => 'results' in u)).toHaveLength(1);
  });

  it('writes results in one update', async () => {
    const w = await ended();
    const patch = w.updates.filter((u) => 'results' in u)[0] as Record<string, unknown>;
    expect(Object.keys(patch)).toEqual(['results']);
  });

  it('keeps tau and the end round out of /results unless the reveal setting is on', async () => {
    const off = await ended();
    expect(stored(off)?.tau).toBeNull();
    expect(JSON.stringify(off.db.results)).not.toContain('endRound');
    const on = await ended({ revealTau: true });
    expect(stored(on)?.tau).toBe(on.engine().tau);
    expect(JSON.stringify(on.db.results)).not.toContain('endRound');
  });

  it('ends mid-quarter with F10: the open quarter is discarded and results cover resolved quarters', async () => {
    const w = world({ endMode: 'manual' });
    await toOpen(w);
    await advance(w.ctx); // resolve 1
    await advance(w.ctx); // open 2
    expect((await endSession(w.ctx)).ok).toBe(true);
    expect(w.pub().phase).toBe('ended');
    expect(stored(w)?.rounds).toBe(1);
    expect(stored(w)?.dataLines).toHaveLength(4);
  });

  it('refuses to write before the session has ended', async () => {
    const w = world();
    await toOpen(w);
    const r = await publishResults(w.ctx);
    expect(r.ok).toBe(false);
    expect(w.db.results).toBeUndefined();
  });

  it('keeps the session ended when the write fails, and a later call writes the same data', async () => {
    const w = world({ endMode: 'fixed', fixedEnd: 1 });
    await toOpen(w);
    await advance(w.ctx); // resolve 1
    w.failUpdates.n = 1;
    const end = await advance(w.ctx); // → ended; the results write is refused
    expect(end.ok).toBe(true);
    expect(end.message).toContain('Results were not written');
    expect(w.pub().phase).toBe('ended');
    expect(w.db.results).toBeUndefined();
    const retry = await ensureResults(w.ctx);
    expect(retry?.ok).toBe(true);
    const again = stored(w);
    expect(again?.rounds).toBe(1);
    // Present now: a second window does nothing.
    expect(await ensureResults(w.ctx)).toBeNull();
    expect(stored(w)).toEqual(again);
  });

  it('two windows writing the results store identical data', async () => {
    const w = await ended();
    const first = JSON.stringify(w.db.results);
    expect((await publishResults(w.ctx)).ok).toBe(true);
    expect(JSON.stringify(w.db.results)).toBe(first);
  });

  it('steps the results panels with F9 and back, within 1 to 6', async () => {
    const w = await ended();
    expect(w.pub().revealStep).toBe(0);
    for (let i = 1; i <= 5; i++) {
      expect((await stepResults(w.ctx, 1)).ok).toBe(true);
      expect(w.pub().revealStep).toBe(i);
    }
    const last = await stepResults(w.ctx, 1);
    expect(last.ok).toBe(false);
    expect(w.pub().revealStep).toBe(5);
    expect((await stepResults(w.ctx, -1)).ok).toBe(true);
    expect(w.pub().revealStep).toBe(4);
  });

  it('does not step results while the session is running', async () => {
    const w = world();
    await toOpen(w);
    expect((await stepResults(w.ctx, 1)).ok).toBe(false);
    expect(w.pub().revealStep).toBe(0);
  });

  it('deletes the session record and reports the freed code', async () => {
    const w = await ended();
    const r = await deleteSession(w.ctx);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('ABCD');
    expect(w.db.public).toBeUndefined();
    expect(w.db.engine).toBeUndefined();
  });
});
