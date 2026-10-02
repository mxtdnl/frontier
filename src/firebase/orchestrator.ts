/**
 * Round orchestration (spec §4, §11). Runs only in the facilitator's browser.
 *
 * Resolution follows §11 exactly: a lock transaction on `public`, one read of the inputs,
 * the pure engine, then a single multi-path `update()`. If that write fails nothing was
 * written, the phase stays `resolving`, and `retryResolution` re-runs from the read step.
 *
 * Everything here talks to the database through `OrchestratorIO`, so the lock and retry
 * behaviour can be tested against an in-memory store as well as against the emulator.
 *
 * This module reads hidden values (`engine`). Import it only from `#/control`, `#/new` and
 * the facilitator side of `#/screen`; never render a value it returns on the projector.
 */
import { serverTimestamp, type Database } from 'firebase/database';
import {
  PARAMS,
  createGame,
  emptyPactPrivate,
  hash32,
  buildResults,
  isFinalRound,
  resolveRound,
  type BotPolicy,
  type Decision,
  type EngineState,
  type FirmInit,
  type GameSettings,
  type FinalResults,
  type Pact,
} from '../engine';
import * as api from './api';
import {
  AUTO_RESOLVE_DELAY_MS,
  adjustTimer,
  claimRetry,
  enterSummit,
  exitSummit,
  lockForResolve,
  pauseTimer,
  resumeTimer,
  stepResultsStep,
  toBriefing,
  toEnded,
  toggleDisclosureStep,
  toOpen,
  type Step,
} from './phases';
import { paths, rel } from './paths';
import { disclosureEntry, pendingWire, type WireInput } from './wire';
import {
  engineStateOf,
  type DecisionNode,
  type EngineNode,
  type FirmNode,
  type MetaNode,
  type PublicNode,
  type ResultsNode,
  type RoundNode,
} from './schema';

// ── I/O boundary ──────────────────────────────────────────────────────────────

export interface OrchestratorIO {
  transactPublic(step: (current: PublicNode) => PublicNode | undefined): Promise<{ committed: boolean; value: PublicNode | null }>;
  readPublic(): Promise<PublicNode | null>;
  readMeta(): Promise<MetaNode | null>;
  readEngine(): Promise<EngineNode | null>;
  readFirms(): Promise<Record<string, FirmNode>>;
  readDecisions(round: number): Promise<Record<string, DecisionNode>>;
  readPacts(): Promise<Record<string, Pact>>;
  readResults(): Promise<ResultsNode | null>;
  /** Removes the whole game and frees its join code in one update. */
  deleteGame(code: string): Promise<void>;
  /** Atomic read-modify-write of `engine/pendingAudits`; `step` returns the new list or undefined to abort. */
  transactPendingAudits(step: (current: string[]) => string[] | undefined): Promise<{ committed: boolean; value: string[] }>;
  /** One atomic multi-path update rooted at `games/{g}` (keys come from `rel`). */
  update(patch: Record<string, unknown>): Promise<void>;
}

export function firebaseIO(db: Database, g: string): OrchestratorIO {
  return {
    transactPublic: (step) => api.transactPublic(db, g, step),
    readPublic: () => api.readPublic(db, g),
    readMeta: () => api.readMeta(db, g),
    readEngine: () => api.readEngine(db, g),
    readFirms: () => api.readFirms(db, g),
    readDecisions: (round) => api.readDecisions(db, g, round),
    readPacts: () => api.readPacts(db, g),
    readResults: () => api.readResults(db, g),
    deleteGame: (code) => api.deleteGame(db, g, code),
    transactPendingAudits: (step) => api.transactPendingAudits(db, g, step),
    update: (patch) => api.updateGame(db, g, patch),
  };
}

export interface Ctx {
  io: OrchestratorIO;
  /** The facilitator's uid. */
  uid: string;
  /** Distinguishes this browser window from another window of the same account. */
  windowId: string;
  /** Server time in ms (local clock plus `/.info/serverTimeOffset`). */
  now: () => number;
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

export const MIN_FIRMS = 2;
export const MAX_FIRMS = 16;

export const INCOMPLETE = 'Resolution incomplete. The quarter stays in RESOLVING and nothing was written. Use Retry on the control console.';

// ── Transactions ──────────────────────────────────────────────────────────────

type Applied = { ok: true; before: PublicNode; after: PublicNode } | { ok: false; message: string };

/** Runs a pure step inside the `public` transaction. */
async function transition(ctx: Ctx, step: Step): Promise<Applied> {
  let reason: string | null = null;
  let before: PublicNode | null = null;
  const tx = await ctx.io.transactPublic((current) => {
    before = current;
    const next = step(current);
    if (typeof next === 'string') {
      reason = next;
      return undefined;
    }
    reason = null;
    return next;
  });
  if (!tx.committed || tx.value === null || before === null) {
    return { ok: false, message: reason ?? 'The session changed in another window first. Check the screen and try again.' };
  }
  return { ok: true, before, after: tx.value };
}

/** The phase and quarter the caller was looking at when it acted. */
export interface Seen {
  phase: PublicNode['phase'];
  round: number;
}

function stale(seen: Seen | undefined, pub: PublicNode): string | null {
  if (!seen || (seen.phase === pub.phase && seen.round === pub.round)) return null;
  return `The session is now in ${pub.phase.toUpperCase()}, quarter ${pub.round}, not ${seen.phase.toUpperCase()}, quarter ${seen.round}. Check the screen before pressing again.`;
}

// ── Engine set-up ─────────────────────────────────────────────────────────────

/** Creation order: server creation time, then database key (push keys are time-ordered). */
export function orderedFirms(firms: Record<string, FirmNode>): Array<[string, FirmNode]> {
  return Object.entries(firms).sort(([ka, a], [kb, b]) => a.createdAt - b.createdAt || (ka < kb ? -1 : ka > kb ? 1 : 0));
}

/**
 * Builds the engine state for the firms that exist now. τ and the end round come from the
 * node written at creation: the setup stream does not depend on the firm list, so a fresh
 * `createGame` would draw the same values, and they are copied across to keep that certain.
 */
export function buildEngineNode(prev: EngineNode, firms: Record<string, FirmNode>): EngineNode {
  const inits: FirmInit[] = orderedFirms(firms).map(([id, f]) => ({
    id,
    ticker: f.ticker,
    isBot: f.isBot,
    botPolicy: f.isBot ? f.botPolicy : null,
  }));
  const end = prev.endRound ?? 14;
  const settings: GameSettings = {
    label: prev.label,
    endMode: prev.endMode,
    minEnd: end,
    maxEnd: end,
    fixedEnd: prev.endRound,
    disclosure: prev.disclosure,
    autoAuditP: prev.autoAuditP,
  };
  const state = createGame(settings, inits, prev.seed, prev.params);
  return { ...state, tau: prev.tau, endRound: prev.endRound, params: prev.params, rngNotes: prev.rngNotes, cfCache: null };
}

/** Writes engine state, per-firm nodes and the opening market numbers for the current firms. */
async function ensureEngine(ctx: Ctx): Promise<{ ok: true; engine: EngineNode } | { ok: false; message: string }> {
  const [prev, firms] = await Promise.all([ctx.io.readEngine(), ctx.io.readFirms()]);
  if (!prev) return { ok: false, message: 'The market set-up is missing for this session. Create a new session.' };
  const count = Object.keys(firms).length;
  if (prev.firms.length === count && count > 0) return { ok: true, engine: prev };
  const engine = buildEngineNode(prev, firms);
  const patch: Record<string, unknown> = {
    [rel.engine()]: engine,
    [rel.publicField('T')]: engine.T,
    [rel.publicField('M')]: engine.M,
  };
  engine.firms.forEach((f) => {
    patch[rel.firmField(f.id, 'order')] = f.order;
    patch[rel.firmPublic(f.id)] = {
      share: 1 / engine.firms.length,
      profit: 0,
      valuation: f.valuation,
      rank: f.rank,
      rankDelta: 0,
      submittedRound: 0,
      auto: false,
      insolvent: false,
      breachUntilRound: 0,
    };
    patch[rel.firmPrivate(f.id)] = {
      cash: f.cash,
      cap: f.cap,
      lastCard: f.lastCard,
      lastPoachTarget: null,
      cumulativeDraw: 0,
      incidents: 0,
    };
  });
  await ctx.io.update(patch);
  return { ok: true, engine };
}

// ── Phase actions ─────────────────────────────────────────────────────────────

export async function startBriefing(ctx: Ctx): Promise<ActionResult> {
  const count = Object.keys(await ctx.io.readFirms()).length;
  if (count < MIN_FIRMS) return fail(`At least ${MIN_FIRMS} firms are needed to start; ${count} formed. Wait for more teams or add bot firms.`);
  if (count > MAX_FIRMS) return fail(`${count} firms formed; the maximum is ${MAX_FIRMS}. Remove firms before starting.`);
  const t = await transition(ctx, toBriefing);
  if (!t.ok) return t;
  const e = await ensureEngine(ctx);
  if (!e.ok) return fail(`${e.message} Press ADVANCE again to retry the set-up.`);
  return ok('Briefing on screen. Firm creation is locked.');
}

export async function startRound(ctx: Ctx, round: number): Promise<ActionResult> {
  const e = await ensureEngine(ctx);
  if (!e.ok) return e;
  const meta = await ctx.io.readMeta();
  if (!meta) return fail('Session record not found. Reload the page.');
  const t = await transition(ctx, toOpen(round, ctx.now(), meta.settings.timerSec * 1000));
  if (!t.ok) return t;
  return ok(`Quarter ${round} is open.`);
}

/** F9 (spec §4). `seen` guards against a double press or a second window. */
export async function advance(ctx: Ctx, seen?: Seen): Promise<ActionResult> {
  const pub = await ctx.io.readPublic();
  if (!pub) return fail('Session not found. Check the address.');
  const old = stale(seen, pub);
  if (old) return fail(old);
  switch (pub.phase) {
    case 'lobby':
      return startBriefing(ctx);
    case 'briefing':
      return startRound(ctx, 1);
    case 'open':
      return resolveCurrentRound(ctx, pub.round);
    case 'reveal': {
      const engine = await ctx.io.readEngine();
      if (!engine) return fail('The market set-up is missing for this session. Create a new session.');
      if (isFinalRound(engine, pub.round, engine.params)) return endSession(ctx);
      return startRound(ctx, pub.round + 1);
    }
    case 'resolving':
      return fail('The quarter is being resolved. If it does not finish, use Retry on the control console.');
    case 'summit':
      return fail('The summit is in session. Press F8 to end it before advancing.');
    case 'ended':
      return stepResults(ctx, 1);
  }
}

/** F10, after the caller's own double-press confirmation. */
export async function endSession(ctx: Ctx, seen?: Seen): Promise<ActionResult> {
  if (seen) {
    const pub = await ctx.io.readPublic();
    const old = pub ? stale(seen, pub) : null;
    if (old) return fail(old);
  }
  const t = await transition(ctx, toEnded(ctx.now()));
  if (!t.ok) return t;
  const head = t.before.phase === 'open' ? 'Session ended. The open quarter was discarded.' : 'Session ended.';
  const written = await publishResults(ctx);
  return ok(written.ok ? `${head} Results are ready.` : `${head} ${written.message}`);
}

// ── Results (§10, §14.4) ──────────────────────────────────────────────────────

/**
 * Computes the final results with the engine and writes `/results` in one update. The output
 * depends only on the engine node and one public setting, so running it again from any
 * window writes identical data.
 */
export async function publishResults(ctx: Ctx): Promise<ActionResult> {
  try {
    const [pub, engine, meta] = await Promise.all([ctx.io.readPublic(), ctx.io.readEngine(), ctx.io.readMeta()]);
    if (!pub || !engine || !meta) return fail('Session data is missing. Reload the page.');
    if (pub.phase !== 'ended') return fail('Results are written once the session has ended.');
    if (engine.firms.length === 0) return fail('No firms took part, so there are no results to write.');
    const results: FinalResults = buildResults(engineStateOf(engine), { revealTau: meta.settings.revealThreshold }, engine.params);
    await ctx.io.update({ [rel.results()]: results });
    return ok('Results written.');
  } catch {
    return fail('Results were not written. Press RETRY RESULTS on the control console, or reload this page.');
  }
}

/** Writes the results only if they are missing; used by any facilitator window that sees an ended session. */
export async function ensureResults(ctx: Ctx): Promise<ActionResult | null> {
  try {
    if ((await ctx.io.readResults()) !== null) return null;
  } catch {
    return fail('Results could not be checked. Check the connection.');
  }
  return publishResults(ctx);
}

/** F9 steps the results panels forward; Esc steps back. */
export async function stepResults(ctx: Ctx, delta: 1 | -1): Promise<ActionResult> {
  const t = await transition(ctx, stepResultsStep(delta));
  if (!t.ok) return t;
  return ok(`Results panel ${t.after.revealStep + 1} of 6.`);
}

/** Deletes the session record and frees its join code. The caller collects the double confirmation. */
export async function deleteSession(ctx: Ctx): Promise<ActionResult> {
  try {
    const meta = await ctx.io.readMeta();
    if (!meta) return fail('Session not found. It may already be deleted.');
    await ctx.io.deleteGame(meta.code);
    return ok(`Session ${meta.code} deleted. The join code is free again.`);
  } catch {
    return fail('The session was not deleted. Check the connection and try again.');
  }
}

/** F8. */
export async function toggleSummit(ctx: Ctx, seen?: Seen): Promise<ActionResult> {
  const pub = await ctx.io.readPublic();
  if (!pub) return fail('Session not found. Check the address.');
  const old = stale(seen, pub);
  if (old) return fail(old);
  const entering = pub.phase !== 'summit';
  const t = await transition(ctx, entering ? enterSummit(ctx.now()) : exitSummit(ctx.now()));
  if (!t.ok) return t;
  return ok(entering ? 'Summit in session. The timer is paused.' : 'Summit closed.');
}

/** F7 (spec §9.3). Flips `public.disclosure` and publishes the matching wire headline. */
export async function toggleDisclosure(ctx: Ctx, seen?: Seen): Promise<ActionResult> {
  const pub = await ctx.io.readPublic();
  if (!pub) return fail('Session not found. Check the address.');
  const old = stale(seen, pub);
  if (old) return fail(old);
  const t = await transition(ctx, toggleDisclosureStep);
  if (!t.ok) return t;
  const on = t.after.disclosure;
  try {
    const key = `d-${ctx.now()}-${on ? 'on' : 'off'}`;
    await ctx.io.update({ [rel.wireEntry(key)]: disclosureEntry(on, t.after, ctx.now()) });
  } catch {
    return ok(`Disclosure ${on ? 'ON' : 'OFF'}. The wire headline was not published; toggle again to retry.`);
  }
  return ok(
    on
      ? 'Disclosure ON. PACE, SAFE and EXPO appear from the next resolution.'
      : 'Disclosure OFF. Nothing is published from the next resolution.',
  );
}

/**
 * F6 (spec §9.2). Queues a manual audit of one pact. It runs at the next resolution with the
 * automatic audits, so a LOBBY card played that quarter still waives the fine.
 */
export async function queueAudit(ctx: Ctx, pactId: string): Promise<ActionResult> {
  const [pub, pacts] = await Promise.all([ctx.io.readPublic(), ctx.io.readPacts()]);
  if (!pub) return fail('Session not found. Check the address.');
  if (pub.phase !== 'open' && pub.phase !== 'reveal' && pub.phase !== 'summit') {
    return fail(`An audit can be queued while a quarter is open, in reveal or in a summit, not in ${pub.phase.toUpperCase()}.`);
  }
  const pact = pacts[pactId];
  if (!pact) return fail('That pact no longer exists. Check the pact list.');
  if (pact.status !== 'active') return fail(`${pact.name} has dissolved and cannot be audited.`);
  const tx = await ctx.io.transactPendingAudits((cur) => (cur.includes(pactId) ? undefined : [...cur, pactId]));
  if (!tx.committed && tx.value.includes(pactId)) return ok(`${pact.name} audit is already queued for the next resolution.`);
  if (!tx.committed) return fail('The audit queue changed in another window first. Try again.');
  return ok(`${pact.name} audit queued. It runs when the quarter resolves.`);
}

/** Writes any pact headlines that are missing from `wire/` (see wire.ts). Safe to run from several windows. */
export async function publishWire(ctx: Ctx, input: Omit<WireInput, 'now'>): Promise<number> {
  const missing = pendingWire({ ...input, now: ctx.now() });
  const keys = Object.keys(missing);
  if (keys.length === 0) return 0;
  const patch: Record<string, unknown> = {};
  for (const k of keys) patch[rel.wireEntry(k)] = missing[k];
  await ctx.io.update(patch);
  return keys.length;
}

export async function addTime(ctx: Ctx, deltaMs: number): Promise<ActionResult> {
  const t = await transition(ctx, adjustTimer(deltaMs, ctx.now()));
  return t.ok ? ok(`${deltaMs > 0 ? 'Added' : 'Removed'} ${Math.abs(deltaMs) / 1000} s.`) : t;
}

export async function setPaused(ctx: Ctx, paused: boolean): Promise<ActionResult> {
  const t = await transition(ctx, paused ? pauseTimer(ctx.now()) : resumeTimer(ctx.now()));
  return t.ok ? ok(paused ? 'Timer paused. Decisions are refused until it resumes.' : 'Timer running.') : t;
}

// ── Resolution (§11) ──────────────────────────────────────────────────────────

/** Step 1 (lock), then steps 2–4. */
export async function resolveCurrentRound(ctx: Ctx, round: number): Promise<ActionResult> {
  const lock = await transition(ctx, lockForResolve(round, ctx.uid));
  if (!lock.ok) return lock;
  return runResolution(ctx, round);
}

/**
 * Step 5: re-run from the read step. Takes over only the holder the caller saw, so two
 * windows pressing Retry together cannot both run.
 */
export async function retryResolution(ctx: Ctx, seenHolder: string | null): Promise<ActionResult> {
  const claim = await transition(ctx, claimRetry(seenHolder, `${ctx.uid}#${ctx.windowId}`));
  if (!claim.ok) return claim;
  return runResolution(ctx, claim.after.round);
}

/** Server-time check used by the auto-resolve timer: true once the grace window has closed. */
export function resolveDue(pub: PublicNode | null, serverNow: number): boolean {
  return pub !== null && pub.phase === 'open' && !pub.paused && pub.deadline !== null && serverNow >= pub.deadline + AUTO_RESOLVE_DELAY_MS;
}

/** Called by the auto-resolve timer. The lock makes duplicate calls harmless. */
export async function autoResolve(ctx: Ctx): Promise<ActionResult | null> {
  const pub = await ctx.io.readPublic();
  if (!resolveDue(pub, ctx.now()) || !pub) return null;
  return resolveCurrentRound(ctx, pub.round);
}

/** Live pact membership is written by participants, so it overrides the engine's copy (§5.3). */
export function mergePacts(state: EngineState, live: Record<string, Pact>): void {
  state.pacts = state.pacts.map((p) => {
    const l = live[p.id];
    return !l || p.status === 'dissolved' ? p : { ...p, members: { ...l.members } };
  });
  const known = new Set(state.pacts.map((p) => p.id));
  const fresh = Object.values(live)
    .filter((l) => !known.has(l.id))
    .sort((a, b) => a.createdRound - b.createdRound || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const l of fresh) {
    state.pacts.push({ ...l, members: { ...l.members } });
    state.pactsPrivate[l.id] ??= emptyPactPrivate();
  }
}

function decisionsOf(nodes: Record<string, DecisionNode>, state: EngineState): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  const ids = new Set(state.firms.map((f) => f.id));
  for (const [id, d] of Object.entries(nodes)) {
    if (ids.has(id)) out[id] = { pace: d.pace, safety: d.safety, card: d.card, target: d.target };
  }
  return out;
}

async function runResolution(ctx: Ctx, round: number): Promise<ActionResult> {
  try {
    // 2. Read inputs once.
    const [engine, nodes, livePacts, pub] = await Promise.all([
      ctx.io.readEngine(),
      ctx.io.readDecisions(round),
      ctx.io.readPacts(),
      ctx.io.readPublic(),
    ]);
    if (!engine || !pub) return fail('Session data is missing. Reload the page.');
    if (pub.phase !== 'resolving' || pub.round !== round) return fail('The quarter is not waiting for resolution. Check the screen.');
    if (engine.round >= round) return fail(`Quarter ${round} is already resolved. Check the screen.`);
    if (engine.round !== round - 1) return fail('The market state is out of step with the quarter. Create a new session.');

    // 3. Run the engine (pure).
    const state = engineStateOf(engine);
    mergePacts(state, livePacts);
    state.disclosure = pub.disclosure;
    const decisions = decisionsOf(nodes, state);
    const result = resolveRound(state, decisions, engine.params);
    const next = result.state;
    const out = result.outputs;

    // 4. Write everything in one atomic update.
    const patch: Record<string, unknown> = {};
    const nextEngine: EngineNode = { ...next, params: engine.params, rngNotes: engine.rngNotes, cfCache: engine.cfCache };
    patch[rel.engine()] = nextEngine;

    const roundNode: RoundNode = {
      T: out.T,
      dT: out.dT,
      M: out.M,
      incidents: out.incidents,
      headlines: out.headlines,
      audits: out.audits,
      disclosure: out.disclosure,
      results: Object.fromEntries(
        Object.entries(out.firms).map(([id, r]) => [id, { share: r.share, profit: r.profit, valuation: r.valuation, rank: r.rank }]),
      ),
    };
    patch[rel.round(round)] = roundNode;

    for (const f of next.firms) {
      const r = out.firms[f.id];
      if (!r) continue;
      patch[rel.firmPrivateField(f.id, 'cash')] = f.cash;
      patch[rel.firmPrivateField(f.id, 'cap')] = f.cap;
      patch[rel.firmPrivateField(f.id, 'lastCard')] = f.lastCard;
      patch[rel.firmPrivateField(f.id, 'lastPoachTarget')] = f.lastPoachTarget;
      patch[rel.firmPrivateField(f.id, 'cumulativeDraw')] = f.cumulativeDraw;
      patch[rel.firmPrivateField(f.id, 'incidents')] = f.incidents;
      patch[rel.firmPrivateHistory(f.id, round)] = r;
      const pubFields: Record<string, unknown> = {
        share: r.share,
        profit: r.profit,
        valuation: r.valuation,
        rank: r.rank,
        rankDelta: r.rankDelta,
        auto: r.auto,
        insolvent: r.insolvent,
        breachUntilRound: f.breachUntilRound,
      };
      for (const [k, v] of Object.entries(pubFields)) patch[rel.firmPublicField(f.id, k)] = v;
      // A firm that committed, or a bot that acted by policy, counts as submitted for this quarter.
      if (decisions[f.id] || f.isBot) patch[rel.firmPublicField(f.id, 'submittedRound')] = round;
    }

    // Why a requested card was dropped (§6.3 step 2): private to the firm, stored beside its history.
    for (const f of next.firms) {
      const mine = out.notices.filter((n) => n.firmId === f.id).map((n) => ({ kind: n.kind, card: n.card }));
      patch[rel.firmPrivateNotices(f.id, round)] = mine.length ? mine : null;
    }

    for (const [id, pp] of Object.entries(next.pactsPrivate)) patch[rel.pactPrivate(id)] = pp;
    for (const p of next.pacts) {
      const l = livePacts[p.id];
      if (!l) {
        const { id: _id, ...node } = p;
        patch[rel.pact(p.id)] = node;
      } else {
        const sameMembers = JSON.stringify(sortKeys(l.members)) === JSON.stringify(sortKeys(p.members));
        if (!sameMembers) patch[rel.pactMembers(p.id)] = Object.keys(p.members).length ? p.members : null;
        if (l.status !== p.status) patch[rel.pactStatus(p.id)] = p.status;
      }
    }

    patch[rel.publicField('phase')] = 'reveal';
    patch[rel.publicField('T')] = next.T;
    patch[rel.publicField('M')] = next.M;
    patch[rel.publicField('collapsed')] = next.collapsed;
    patch[rel.publicField('collapseRound')] = next.collapseRound;
    patch[rel.publicField('deadline')] = null;
    patch[rel.publicField('paused')] = false;
    patch[rel.publicField('pausedRemainingMs')] = null;
    patch[rel.publicField('resumePhase')] = null;
    patch[rel.publicField('resolvingBy')] = null;

    await ctx.io.update(patch);
    return ok(`Quarter ${round} resolved.`);
  } catch {
    return fail(INCOMPLETE);
  }
}

const sortKeys = (o: Record<string, number>): Array<[string, number]> => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1));

// ── Session creation (#/new) ──────────────────────────────────────────────────

/** Fictional bot firms (spec §15: fictional entities only). */
export const BOT_FIRMS: ReadonlyArray<{ name: string; ticker: string }> = [
  { name: 'Arcturn Labs', ticker: 'ARCN' },
  { name: 'Brelek Models', ticker: 'BRLK' },
  { name: 'Cyra Systems', ticker: 'CYRA' },
  { name: 'Dolmen AI', ticker: 'DOLM' },
  { name: 'Ember Compute', ticker: 'EMBR' },
  { name: 'Fjordline', ticker: 'FJRD' },
  { name: 'Glynn Research', ticker: 'GLYN' },
  { name: 'Hearth Systems', ticker: 'HRTH' },
  { name: 'Iridian Works', ticker: 'IRDN' },
  { name: 'Jorvik Data', ticker: 'JRVK' },
  { name: 'Kestrel Logic', ticker: 'KSTL' },
  { name: 'Lumen Cortex', ticker: 'LMNX' },
  { name: 'Marrow Dynamics', ticker: 'MRRW' },
  { name: 'Norvane Group', ticker: 'NRVN' },
  { name: 'Orrin Compute', ticker: 'ORRN' },
  { name: 'Pallet Research', ticker: 'PLTT' },
];

export interface NewSessionInput {
  timerSec: number;
  autoResolve: boolean;
  endMode: GameSettings['endMode'];
  minEnd: number;
  maxEnd: number;
  fixedEnd: number;
  disclosure: boolean;
  autoAuditP: number;
  revealThreshold: boolean;
  litRoom: boolean;
  bots: BotPolicy[];
  /** Fixed seed text for rehearsal; empty for a random seed. Text that is not a whole number is hashed. */
  seed: string;
}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Four letters A–Z without I and O, from the browser's cryptographic generator. */
export function randomCode(): string {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => CODE_LETTERS.charAt(x % CODE_LETTERS.length)).join('');
}

export function seedFromText(text: string): number {
  const t = text.trim();
  if (/^\d{1,10}$/.test(t) && Number(t) <= 0xffffffff) return Number(t) >>> 0;
  return hash32(t);
}

/**
 * Creates the session: the game record, its join code, the hidden engine node and any bot
 * firms, in one atomic update. If the code is taken the write fails and a new code is tried.
 */
export async function createSession(
  db: Database,
  uid: string,
  input: NewSessionInput,
  makeCode: () => string = randomCode,
): Promise<{ gameId: string; code: string }> {
  const seed = input.seed.trim() === '' ? crypto.getRandomValues(new Uint32Array(1))[0] ?? 1 : seedFromText(input.seed);
  const gameId = api.newKey(db, 'games');
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = makeCode();
    if ((await api.resolveCode(db, code)) !== null) continue;
    const settings: GameSettings = {
      label: code,
      endMode: input.endMode,
      minEnd: input.minEnd,
      maxEnd: input.maxEnd,
      fixedEnd: input.endMode === 'fixed' ? input.fixedEnd : null,
      disclosure: input.disclosure,
      autoAuditP: input.autoAuditP,
    };
    // Empty firm list: τ and the end round depend only on the seed. The firms join the engine at the briefing.
    const state = createGame(settings, [], seed, PARAMS);
    const engine: EngineNode = { ...state, params: PARAMS, rngNotes: null, cfCache: null };
    const meta: MetaNode = {
      code,
      title: `Session ${code}`,
      createdAt: Date.now(),
      facilitatorUid: uid,
      settings: { timerSec: input.timerSec, autoResolve: input.autoResolve, revealThreshold: input.revealThreshold, litRoom: input.litRoom },
    };
    const pub: PublicNode = {
      phase: 'lobby',
      round: 0,
      deadline: null,
      paused: false,
      disclosure: input.disclosure,
      T: state.T,
      M: 0,
      collapsed: false,
      collapseRound: null,
      joinLocked: false,
      resolvingBy: null,
      endedAt: null,
      revealStep: 0,
      resumePhase: null,
      pausedRemainingMs: null,
    };
    const extra: Record<string, unknown> = { [rel.engine()]: engine };
    input.bots.forEach((policy, i) => {
      const bot = BOT_FIRMS[i % BOT_FIRMS.length];
      if (!bot) return;
      const id = api.newKey(db, paths.firms(gameId));
      extra[rel.firm(id)] = { name: bot.name, ticker: bot.ticker, createdAt: serverTimestamp(), order: i, isBot: true, botPolicy: policy };
    });
    try {
      await api.createGameRecord(db, gameId, meta, pub, extra);
      return { gameId, code };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not reserve a join code. Try again.');
}
