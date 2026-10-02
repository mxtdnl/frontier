/**
 * Typed reads, writes and subscriptions for every node in spec §12. Every path comes from
 * paths.ts and every value read back goes through a normaliser in schema.ts.
 *
 * Sections marked FACILITATOR read or write nodes the rules reserve for the facilitator
 * (hidden values included). Import them only from `#/control`, `#/new`, `#/screen`
 * orchestration and the orchestrator; never from participant or projector rendering code.
 */
import {
  get,
  onValue,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
  type Database,
  type Unsubscribe,
} from 'firebase/database';
import type { Decision, Pact, PactTerms } from '../engine';
import { paths } from './paths';
import {
  fromDecision,
  fromDecisions,
  fromEngine,
  fromFirm,
  fromFirmPrivate,
  fromFirmSecret,
  fromFirms,
  fromFirmsPublic,
  fromMember,
  fromMeta,
  fromPact,
  fromPacts,
  fromPactsPrivate,
  fromPresence,
  fromPublic,
  fromResults,
  fromRound,
  fromRounds,
  rec,
  toPactNode,
  type DecisionNode,
  type EngineNode,
  type FirmNode,
  type FirmPrivateNode,
  type FirmPublicNode,
  type FirmSecretNode,
  type MemberNode,
  type MetaNode,
  type PactPrivateNode,
  type PresenceNode,
  type PublicNode,
  type ResultsNode,
  type RoundNode,
} from './schema';

export type Listener<T> = (value: T) => void;
export type ErrorListener = (error: Error) => void;

// ── Generic helpers ────────────────────────────────────────────────────────────

async function read<T>(db: Database, path: string, map: (v: unknown) => T): Promise<T> {
  const snap = await get(ref(db, path));
  return map(snap.val());
}

function watch<T>(db: Database, path: string, map: (v: unknown) => T, cb: Listener<T>, onError?: ErrorListener): Unsubscribe {
  return onValue(
    ref(db, path),
    (snap) => cb(map(snap.val())),
    (err) => onError?.(err),
  );
}

/** A fresh database key (time-ordered, generated on the client). */
export function newKey(db: Database, parentPath: string): string {
  const k = push(ref(db, parentPath)).key;
  if (!k) throw new Error('Could not generate a database key.');
  return k;
}

/** Four random digits from the browser's cryptographic generator. */
export function generatePin(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String((a[0] ?? 0) % 10_000).padStart(4, '0');
}

// ── Allowlist and join codes ───────────────────────────────────────────────────

export const isFacilitator = (db: Database, uid: string): Promise<boolean> =>
  read(db, paths.facilitator(uid), (v) => v === true);

export const resolveCode = (db: Database, code: string): Promise<string | null> =>
  read(db, paths.code(code), (v) => (typeof v === 'string' ? v : null));

// ── meta and public (everyone signed in reads) ───────────────────────────────

export const readMeta = (db: Database, g: string): Promise<MetaNode | null> => read(db, paths.meta(g), fromMeta);
export const subscribeMeta = (db: Database, g: string, cb: Listener<MetaNode | null>, onError?: ErrorListener): Unsubscribe =>
  watch(db, paths.meta(g), fromMeta, cb, onError);

export const readPublic = (db: Database, g: string): Promise<PublicNode | null> => read(db, paths.public(g), fromPublic);
export const subscribePublic = (db: Database, g: string, cb: Listener<PublicNode | null>, onError?: ErrorListener): Unsubscribe =>
  watch(db, paths.public(g), fromPublic, cb, onError);

// ── firms, firmsPublic, rounds, pacts (everyone signed in reads) ─────────────

export const readFirms = (db: Database, g: string): Promise<Record<string, FirmNode>> => read(db, paths.firms(g), fromFirms);
export const subscribeFirms = (db: Database, g: string, cb: Listener<Record<string, FirmNode>>, onError?: ErrorListener): Unsubscribe =>
  watch(db, paths.firms(g), fromFirms, cb, onError);

export const subscribeFirmsPublic = (
  db: Database,
  g: string,
  cb: Listener<Record<string, FirmPublicNode>>,
  onError?: ErrorListener,
): Unsubscribe => watch(db, paths.firmsPublic(g), fromFirmsPublic, cb, onError);

export const readRound = (db: Database, g: string, round: number): Promise<RoundNode | null> => read(db, paths.round(g, round), fromRound);
export const subscribeRounds = (db: Database, g: string, cb: Listener<Record<string, RoundNode>>, onError?: ErrorListener): Unsubscribe =>
  watch(db, paths.rounds(g), fromRounds, cb, onError);

export const readPacts = (db: Database, g: string): Promise<Record<string, Pact>> => read(db, paths.pacts(g), fromPacts);
export const subscribePacts = (db: Database, g: string, cb: Listener<Record<string, Pact>>, onError?: ErrorListener): Unsubscribe =>
  watch(db, paths.pacts(g), fromPacts, cb, onError);

// ── Participant: found or join a firm ─────────────────────────────────────────

export interface FoundFirmInput {
  name: string;
  ticker: string;
  pin: string;
  label: string;
  /** Display order hint; the facilitator assigns the engine order at game start. */
  order: number;
}

/**
 * Founds a firm in one multi-path update: the firm, its PIN and the founder's membership
 * (spec §13). Returns the new firm id.
 */
export async function foundFirm(db: Database, g: string, uid: string, input: FoundFirmInput): Promise<string> {
  const firmId = newKey(db, paths.firms(g));
  await update(ref(db), {
    [paths.firm(g, firmId)]: { name: input.name, ticker: input.ticker, createdAt: serverTimestamp(), order: input.order, isBot: false },
    [paths.firmSecret(g, firmId)]: { pin: input.pin },
    [paths.member(g, uid)]: memberValue(firmId, input.pin, input.label),
  });
  return firmId;
}

function memberValue(firmId: string, pin: string, label: string): Record<string, unknown> {
  return { firmId, pin, joinedAt: serverTimestamp(), ...(label ? { label } : {}) };
}

/** Joins (or rejoins) a firm; the rules check the PIN. */
export async function joinFirm(db: Database, g: string, uid: string, firmId: string, pin: string, label: string): Promise<void> {
  await set(ref(db, paths.member(g, uid)), memberValue(firmId, pin, label));
}

/** Own membership, or a teammate's (rules allow both). */
export const readMember = (db: Database, g: string, uid: string): Promise<MemberNode | null> => read(db, paths.member(g, uid), fromMember);
export const subscribeMember = (db: Database, g: string, uid: string, cb: Listener<MemberNode | null>, onError?: ErrorListener): Unsubscribe =>
  watch(db, paths.member(g, uid), fromMember, cb, onError);

/** Own firm's PIN, to show teammates. */
export const readFirmSecret = (db: Database, g: string, firmId: string): Promise<FirmSecretNode | null> =>
  read(db, paths.firmSecret(g, firmId), fromFirmSecret);

// ── Participant: own firm private data and decisions ──────────────────────────

export const subscribeFirmPrivate = (
  db: Database,
  g: string,
  firmId: string,
  cb: Listener<FirmPrivateNode | null>,
  onError?: ErrorListener,
): Unsubscribe => watch(db, paths.firmPrivate(g, firmId), fromFirmPrivate, cb, onError);

/** Commits or recommits a decision. The server stamps `at`; the rules check the deadline. */
export async function submitDecision(db: Database, g: string, round: number, firmId: string, uid: string, d: Decision): Promise<void> {
  await set(ref(db, paths.decision(g, round, firmId)), {
    pace: d.pace,
    safety: d.safety,
    card: d.card,
    target: d.card === 'POACH' ? d.target : null,
    by: uid,
    at: serverTimestamp(),
  });
}

export const subscribeDecision = (
  db: Database,
  g: string,
  round: number,
  firmId: string,
  cb: Listener<DecisionNode | null>,
  onError?: ErrorListener,
): Unsubscribe => watch(db, paths.decision(g, round, firmId), fromDecision, cb, onError);

// ── Participant: pacts (own firm's membership only) ───────────────────────────

/** Proposes a pact with the proposer as its only member. Returns the pact id. */
export async function proposePact(db: Database, g: string, round: number, proposer: string, name: string, terms: PactTerms): Promise<string> {
  const pactId = newKey(db, paths.pacts(g));
  const pact: Pact = { id: pactId, name, proposer, terms, members: { [proposer]: round }, createdRound: round, status: 'active' };
  await set(ref(db, paths.pact(g, pactId)), toPactNode(pact));
  return pactId;
}

export const joinPact = (db: Database, g: string, pactId: string, firmId: string, round: number): Promise<void> =>
  set(ref(db, paths.pactMember(g, pactId, firmId)), round);

export const leavePact = (db: Database, g: string, pactId: string, firmId: string): Promise<void> =>
  set(ref(db, paths.pactMember(g, pactId, firmId)), null);

// ── results (everyone signed in, once ended) ──────────────────────────────────

export const subscribeResults = (db: Database, g: string, cb: Listener<ResultsNode | null>, onError?: ErrorListener): Unsubscribe =>
  watch(db, paths.results(g), fromResults, cb, onError);

// ── FACILITATOR ───────────────────────────────────────────────────────────────

/**
 * Creates the game and claims its join code in one update. Fails if the code is taken,
 * so the caller can retry with another code.
 */
export async function createGameRecord(
  db: Database,
  g: string,
  meta: MetaNode,
  pub: PublicNode,
  /** More nodes to create in the same atomic update, keyed by path relative to the game (`rel`). */
  extra: Record<string, unknown> = {},
): Promise<void> {
  const patch: Record<string, unknown> = {
    [paths.meta(g)]: meta,
    [paths.public(g)]: pub,
    [paths.code(meta.code)]: g,
  };
  for (const [k, v] of Object.entries(extra)) patch[`${paths.game(g)}/${k}`] = v;
  await update(ref(db), patch);
}

/** Deletes the game and frees its join code. */
export async function deleteGame(db: Database, g: string, code: string): Promise<void> {
  await update(ref(db), { [paths.game(g)]: null, [paths.code(code)]: null });
}

/**
 * Atomic read-modify-write of `public` (spec §11 step 1). `step` returns the new node, or
 * `undefined` to abort. It may run more than once, so it must be pure. When the SDK has no
 * cached value it is first called with nothing; returning the empty value makes the SDK
 * fetch the server's copy and call `step` again with it.
 */
export async function transactPublic(
  db: Database,
  g: string,
  step: (current: PublicNode) => PublicNode | undefined,
): Promise<{ committed: boolean; value: PublicNode | null }> {
  const result = await runTransaction(
    ref(db, paths.public(g)),
    (raw: unknown) => {
      const current = fromPublic(raw);
      if (current === null) return raw === undefined ? null : raw;
      return step(current);
    },
    { applyLocally: false },
  );
  return { committed: result.committed, value: fromPublic(result.snapshot.val()) };
}

export const updatePublic = (db: Database, g: string, patch: Partial<PublicNode>): Promise<void> =>
  update(ref(db, paths.public(g)), patch);

/**
 * One atomic multi-path update rooted at `games/{g}` (spec §11 step 4). Keys come from
 * `rel` in paths.ts.
 */
export const updateGame = (db: Database, g: string, patch: Record<string, unknown>): Promise<void> =>
  update(ref(db, paths.game(g)), patch);

export async function addBotFirm(db: Database, g: string, firm: Omit<FirmNode, 'createdAt'>): Promise<string> {
  const firmId = newKey(db, paths.firms(g));
  await set(ref(db, paths.firm(g, firmId)), { ...firm, createdAt: serverTimestamp() });
  return firmId;
}

export const readFirm = (db: Database, g: string, firmId: string): Promise<FirmNode> => read(db, paths.firm(g, firmId), fromFirm);

export const subscribeMembers = (db: Database, g: string, cb: Listener<Record<string, MemberNode>>, onError?: ErrorListener): Unsubscribe =>
  watch(db, paths.members(g), (v) => rec(v, (x) => fromMember(x) as MemberNode), cb, onError);

export const subscribePresenceAll = (
  db: Database,
  g: string,
  cb: Listener<Record<string, PresenceNode>>,
  onError?: ErrorListener,
): Unsubscribe => watch(db, paths.presenceAll(g), (v) => rec(v, (x) => fromPresence(x) as PresenceNode), cb, onError);

export const readDecisions = (db: Database, g: string, round: number): Promise<Record<string, DecisionNode>> =>
  read(db, paths.decisions(g, round), fromDecisions);
export const subscribeDecisions = (
  db: Database,
  g: string,
  round: number,
  cb: Listener<Record<string, DecisionNode>>,
  onError?: ErrorListener,
): Unsubscribe => watch(db, paths.decisions(g, round), fromDecisions, cb, onError);

export const readFirmsPrivate = (db: Database, g: string): Promise<Record<string, FirmPrivateNode>> =>
  read(db, paths.firmsPrivate(g), (v) => rec(v, (x) => fromFirmPrivate(x) as FirmPrivateNode));

export const readPactsPrivate = (db: Database, g: string): Promise<Record<string, PactPrivateNode>> =>
  read(db, paths.pactsPrivate(g), fromPactsPrivate);
export const subscribePactsPrivate = (
  db: Database,
  g: string,
  cb: Listener<Record<string, PactPrivateNode>>,
  onError?: ErrorListener,
): Unsubscribe => watch(db, paths.pactsPrivate(g), fromPactsPrivate, cb, onError);

export const readEngine = (db: Database, g: string): Promise<EngineNode | null> => read(db, paths.engine(g), fromEngine);
export const subscribeEngine = (db: Database, g: string, cb: Listener<EngineNode | null>, onError?: ErrorListener): Unsubscribe =>
  watch(db, paths.engine(g), fromEngine, cb, onError);
export const writeEngine = (db: Database, g: string, engine: EngineNode): Promise<void> => set(ref(db, paths.engine(g)), engine);

export const readResults = (db: Database, g: string): Promise<ResultsNode | null> => read(db, paths.results(g), fromResults);
export const writeResults = (db: Database, g: string, results: ResultsNode): Promise<void> => set(ref(db, paths.results(g)), results);

/** A pact as read back from the public node, by id. */
export const readPact = (db: Database, g: string, pactId: string): Promise<Pact> => read(db, paths.pact(g, pactId), (v) => fromPact(v, pactId));
