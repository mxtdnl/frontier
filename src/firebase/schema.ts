/**
 * Shapes of every Realtime Database node (spec §12), and normalisers for reading them back.
 *
 * The database drops `null` values and empty objects and arrays, and stores arrays as
 * objects with numeric keys. Every `from*` function below restores the exact shape the
 * rest of the app expects, so `null` fields, empty lists and empty maps come back.
 */
import { PARAMS } from '../engine/params';
import type { Params } from '../engine/params';
import type { FinalResults } from '../engine/results';
import type { ConductLedger, Contribution, FirmContribution } from '../engine/contribution';
import type {
  AuditBreach,
  AuditResult,
  BotPolicy,
  Card,
  CounterfactualResult,
  Decision,
  DisclosureEntry,
  EndMode,
  EngineState,
  FirmRoundResult,
  FirmState,
  Headline,
  Pace,
  NoticeKind,
  Pact,
  PactPrivate,
  RoundRecord,
} from '../engine';

export type Phase = 'lobby' | 'briefing' | 'open' | 'resolving' | 'reveal' | 'summit' | 'ended';

/** Team mode: up to 16 firms of 1–5 devices. Multiplayer mode: up to 50 one-person firms (spec §2, §5.4). */
export type SessionMode = 'team' | 'multiplayer';

/** Settings safe for every participant to read. Hidden settings live only in `engine`. */
export interface PublicSettings {
  mode: SessionMode;
  timerSec: number;
  autoResolve: boolean;
  /** Show the τ line on the results screen (§5.4). */
  revealThreshold: boolean;
  litRoom: boolean;
}

export interface MetaNode {
  code: string;
  title: string;
  createdAt: number;
  facilitatorUid: string;
  settings: PublicSettings;
}

export interface PublicNode {
  phase: Phase;
  round: number;
  /** Server timestamp in ms; null when no round is open. */
  deadline: number | null;
  paused: boolean;
  disclosure: boolean;
  T: number;
  M: number;
  collapsed: boolean;
  collapseRound: number | null;
  joinLocked: boolean;
  resolvingBy: string | null;
  endedAt: number | null;
  /** Results sequence index (§14.4). */
  revealStep: number;
  /** Phase to return to when a summit ends (`open` or `reveal`); null outside a summit. */
  resumePhase: ResumePhase | null;
  /** Time left on the round timer while it is paused or a summit is running; null otherwise. */
  pausedRemainingMs: number | null;
}

export type ResumePhase = 'open' | 'reveal';

export interface FirmNode {
  name: string;
  ticker: string;
  createdAt: number;
  order: number;
  isBot: boolean;
  botPolicy: BotPolicy | null;
}

export interface FirmSecretNode {
  pin: string;
}

export interface FirmPublicNode {
  share: number;
  profit: number;
  valuation: number;
  rank: number;
  rankDelta: number;
  submittedRound: number;
  auto: boolean;
  insolvent: boolean;
  breachUntilRound: number;
}

/** A private notice stored for a firm: why a card it requested was dropped (§6.3 step 2). */
export interface NoticeEntry {
  kind: NoticeKind;
  card: Card;
}

export interface FirmPrivateNode {
  cash: number;
  cap: number;
  lastCard: Card;
  lastPoachTarget: string | null;
  cumulativeDraw: number;
  incidents: number;
  /** round → the firm's own outcome for that quarter. */
  history: Record<string, FirmRoundResult>;
  /** round → notices for that quarter's resolution. Absent quarters had none. */
  notices: Record<string, NoticeEntry[]>;
}

/**
 * `wire/{key}`: a headline published outside resolution (pact formed, joined or left,
 * disclosure toggled). Written only by the facilitator window.
 */
export interface WireNode {
  /** Server time in ms when published. */
  at: number;
  /** Quarter shown on the label: the quarter open or just resolved when it happened. */
  round: number;
  /** Position among resolved headlines: `round - 0.5` before that quarter resolved, `round` after. */
  seq: number;
  kind: Headline['kind'];
  text: string;
  /** Pact events only: the pact, the firm and the quarter the firm joined. Used to avoid duplicates. */
  pact: string | null;
  firm: string | null;
  joined: number | null;
}

export interface MemberNode {
  firmId: string;
  /** Checked by the rules against `firmSecrets/{firmId}/pin` on every write. */
  pin: string;
  /** Optional device initials; empty string when not given. */
  label: string;
  joinedAt: number;
}

export interface PresenceNode {
  online: boolean;
  lastSeen: number;
}

export interface DecisionNode extends Decision {
  by: string;
  /** Server timestamp in ms. */
  at: number;
}

export interface RoundResultEntry {
  share: number;
  profit: number;
  valuation: number;
  rank: number;
}

export interface RoundNode {
  T: number;
  dT: number;
  M: number;
  incidents: number;
  /** Firms that had an incident, in creation order (§12, Session 18). Public: the headlines already name them. */
  incidentFirms: string[];
  headlines: Headline[];
  audits: AuditResult[];
  disclosure: Record<string, DisclosureEntry> | null;
  results: Record<string, RoundResultEntry>;
  /** Server time in ms of the resolution, for the facilitator wire screen (§14.2, Session 18); null before Session 18. */
  resolvedAt: number | null;
}

/** `pacts/{pactId}`; the id is the key, not a stored field. */
export type PactNode = Omit<Pact, 'id'>;

export type PactPrivateNode = PactPrivate;

/** `engine`: the full engine state plus the §12 extras. Facilitator only. */
export interface EngineNode extends EngineState {
  params: Params;
  rngNotes: string | null;
  cfCache: CounterfactualResult | null;
}

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** `results`: written once by the facilitator when the session ends (spec §10, §12). */
export type ResultsNode = FinalResults;

// ── Normalisers ────────────────────────────────────────────────────────────────

type Raw = unknown;

const isObj = (v: Raw): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A list stored by the database: an array (possibly with holes), a numeric-keyed object, or absent. */
export function arr<T>(v: Raw, map: (x: unknown) => T = (x) => x as T): T[] {
  if (Array.isArray(v)) return v.filter((x) => x !== undefined && x !== null).map(map);
  if (isObj(v)) {
    return Object.keys(v)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => map(v[k]));
  }
  return [];
}

/**
 * A map stored by the database, or absent. Records keyed by small integers (rounds) can
 * come back as arrays; the indices become keys again.
 */
export function rec<T>(v: Raw, map: (x: unknown, key: string) => T = (x) => x as T): Record<string, T> {
  const out: Record<string, T> = {};
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      if (x !== undefined && x !== null) out[String(i)] = map(x, String(i));
    });
  } else if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) if (x !== undefined && x !== null) out[k] = map(x, k);
  }
  return out;
}

const obj = (v: Raw): Record<string, unknown> => (isObj(v) ? v : {});
const num = (v: Raw, d = 0): number => (typeof v === 'number' ? v : d);
const numOrNull = (v: Raw): number | null => (typeof v === 'number' ? v : null);
const str = (v: Raw, d = ''): string => (typeof v === 'string' ? v : d);
const strOrNull = (v: Raw): string | null => (typeof v === 'string' ? v : null);
const bool = (v: Raw): boolean => v === true;

export function fromMeta(v: Raw): MetaNode | null {
  if (!isObj(v)) return null;
  const s = obj(v.settings);
  return {
    code: str(v.code),
    title: str(v.title),
    createdAt: num(v.createdAt),
    facilitatorUid: str(v.facilitatorUid),
    settings: { mode: s.mode === 'multiplayer' ? 'multiplayer' : 'team', timerSec: num(s.timerSec, 120), autoResolve: bool(s.autoResolve), revealThreshold: bool(s.revealThreshold), litRoom: bool(s.litRoom) },
  };
}

export function fromPublic(v: Raw): PublicNode | null {
  if (!isObj(v)) return null;
  return {
    phase: str(v.phase, 'lobby') as Phase,
    round: num(v.round),
    deadline: numOrNull(v.deadline),
    paused: bool(v.paused),
    disclosure: bool(v.disclosure),
    T: num(v.T),
    M: num(v.M),
    collapsed: bool(v.collapsed),
    collapseRound: numOrNull(v.collapseRound),
    joinLocked: bool(v.joinLocked),
    resolvingBy: strOrNull(v.resolvingBy),
    endedAt: numOrNull(v.endedAt),
    revealStep: num(v.revealStep),
    resumePhase: v.resumePhase === 'open' || v.resumePhase === 'reveal' ? v.resumePhase : null,
    pausedRemainingMs: numOrNull(v.pausedRemainingMs),
  };
}

export function fromFirm(v: Raw): FirmNode {
  const o = obj(v);
  return {
    name: str(o.name),
    ticker: str(o.ticker),
    createdAt: num(o.createdAt),
    order: num(o.order),
    isBot: bool(o.isBot),
    botPolicy: strOrNull(o.botPolicy) as BotPolicy | null,
  };
}

export const fromFirms = (v: Raw): Record<string, FirmNode> => rec(v, fromFirm);

export function fromFirmSecret(v: Raw): FirmSecretNode | null {
  return isObj(v) && typeof v.pin === 'string' ? { pin: v.pin } : null;
}

export function fromFirmPublic(v: Raw): FirmPublicNode {
  const o = obj(v);
  return {
    share: num(o.share),
    profit: num(o.profit),
    valuation: num(o.valuation),
    rank: num(o.rank),
    rankDelta: num(o.rankDelta),
    submittedRound: num(o.submittedRound),
    auto: bool(o.auto),
    insolvent: bool(o.insolvent),
    breachUntilRound: num(o.breachUntilRound),
  };
}

export const fromFirmsPublic = (v: Raw): Record<string, FirmPublicNode> => rec(v, fromFirmPublic);

export function fromFirmRoundResult(v: Raw): FirmRoundResult {
  const o = obj(v);
  return {
    pace: num(o.pace, 2) as Pace,
    safety: num(o.safety),
    card: str(o.card, 'NONE') as Card,
    target: strOrNull(o.target),
    auto: bool(o.auto),
    expo: num(o.expo),
    draw: num(o.draw),
    incident: bool(o.incident),
    share: num(o.share),
    revenue: num(o.revenue),
    cost: num(o.cost),
    fine: num(o.fine),
    profit: num(o.profit),
    cash: num(o.cash),
    cap: num(o.cap),
    valuation: num(o.valuation),
    rank: num(o.rank),
    rankDelta: num(o.rankDelta),
    insolvent: bool(o.insolvent),
  };
}

export function fromFirmPrivate(v: Raw): FirmPrivateNode | null {
  if (!isObj(v)) return null;
  return {
    cash: num(v.cash),
    cap: num(v.cap),
    lastCard: str(v.lastCard, 'NONE') as Card,
    lastPoachTarget: strOrNull(v.lastPoachTarget),
    cumulativeDraw: num(v.cumulativeDraw),
    incidents: num(v.incidents),
    history: rec(v.history, fromFirmRoundResult),
    notices: rec(v.notices, (x) => arr(x, fromNotice)),
  };
}

const fromNotice = (v: Raw): NoticeEntry => {
  const o = obj(v);
  return { kind: str(o.kind, 'card-cooldown') as NoticeKind, card: str(o.card, 'NONE') as Card };
};

export function fromWireEntry(v: Raw): WireNode | null {
  if (!isObj(v) || typeof v.text !== 'string') return null;
  return {
    at: num(v.at),
    round: num(v.round),
    seq: num(v.seq, num(v.round)),
    kind: str(v.kind, 'ambient') as Headline['kind'],
    text: v.text,
    pact: strOrNull(v.pact),
    firm: strOrNull(v.firm),
    joined: numOrNull(v.joined),
  };
}

export const fromWire = (v: Raw): Record<string, WireNode> => {
  const out: Record<string, WireNode> = {};
  for (const [k, x] of Object.entries(obj(v))) {
    const e = fromWireEntry(x);
    if (e) out[k] = e;
  }
  return out;
};

export function fromMember(v: Raw): MemberNode | null {
  if (!isObj(v) || typeof v.firmId !== 'string') return null;
  return { firmId: v.firmId, pin: str(v.pin), label: str(v.label), joinedAt: num(v.joinedAt) };
}

export function fromPresence(v: Raw): PresenceNode | null {
  if (!isObj(v)) return null;
  return { online: bool(v.online), lastSeen: num(v.lastSeen) };
}

export function fromDecision(v: Raw): DecisionNode | null {
  if (!isObj(v)) return null;
  return {
    pace: num(v.pace, 2) as Pace,
    safety: num(v.safety),
    card: str(v.card, 'NONE') as Card,
    target: strOrNull(v.target),
    by: str(v.by),
    at: num(v.at),
  };
}

export const fromDecisions = (v: Raw): Record<string, DecisionNode> =>
  rec(v, (x) => fromDecision(x) as DecisionNode);

const fromHeadline = (v: Raw): Headline => {
  const o = obj(v);
  return { kind: str(o.kind, 'ambient') as Headline['kind'], text: str(o.text) };
};

const fromBreach = (v: Raw): AuditBreach => {
  const o = obj(v);
  return {
    firmId: str(o.firmId),
    rounds: arr(o.rounds, (x) => num(x)),
    count: num(o.count),
    fine: num(o.fine),
    waived: bool(o.waived),
    expelled: bool(o.expelled),
  };
};

export const fromAudit = (v: Raw): AuditResult => {
  const o = obj(v);
  return {
    pactId: str(o.pactId),
    kind: str(o.kind, 'auto') as AuditResult['kind'],
    rounds: arr(o.rounds, (x) => num(x)),
    breaches: arr(o.breaches, fromBreach),
  };
};

const fromDisclosureEntry = (v: Raw): DisclosureEntry => {
  const o = obj(v);
  return { pace: num(o.pace, 2) as Pace, safety: num(o.safety), expo: num(o.expo), risk: numOrNull(o.risk) };
};

const fromDisclosure = (v: Raw): Record<string, DisclosureEntry> | null =>
  isObj(v) || Array.isArray(v) ? rec(v, fromDisclosureEntry) : null;

export function fromRound(v: Raw): RoundNode | null {
  if (!isObj(v)) return null;
  return {
    T: num(v.T),
    dT: num(v.dT),
    M: num(v.M),
    incidents: num(v.incidents),
    incidentFirms: arr(v.incidentFirms, (x) => str(x)),
    headlines: arr(v.headlines, fromHeadline),
    audits: arr(v.audits, fromAudit),
    disclosure: fromDisclosure(v.disclosure),
    results: rec(v.results, (x) => {
      const o = obj(x);
      return { share: num(o.share), profit: num(o.profit), valuation: num(o.valuation), rank: num(o.rank) };
    }),
    resolvedAt: numOrNull(v.resolvedAt),
  };
}

export const fromRounds = (v: Raw): Record<string, RoundNode> => rec(v, (x) => fromRound(x) as RoundNode);

const fromTerms = (v: Raw): Pact['terms'] => {
  const o = obj(v);
  return { maxPace: numOrNull(o.maxPace) as Pace | null, minSafety: numOrNull(o.minSafety) };
};

export function fromPact(v: Raw, id: string): Pact {
  const o = obj(v);
  return {
    id,
    name: str(o.name),
    proposer: str(o.proposer),
    terms: fromTerms(o.terms),
    members: rec(o.members, (x) => num(x)),
    createdRound: num(o.createdRound),
    status: str(o.status, 'active') as Pact['status'],
  };
}

export const fromPacts = (v: Raw): Record<string, Pact> => rec(v, (x, k) => fromPact(x, k));

/** The stored form of a pact: the id is the key, so it is dropped from the value. */
export function toPactNode(p: Pact): PactNode {
  const { id: _id, ...rest } = p;
  return rest;
}

const trueMap = (v: Raw): Record<string, true> => {
  const out: Record<string, true> = {};
  for (const [k, x] of Object.entries(rec(v))) if (x === true) out[k] = true;
  return out;
};

export function fromPactPrivate(v: Raw): PactPrivateNode {
  const o = obj(v);
  return {
    violations: rec(o.violations, trueMap),
    detected: rec(o.detected, trueMap),
    checked: rec(o.checked, trueMap),
    sanctions: rec(o.sanctions, (x) => num(x)),
    lastAuditRound: num(o.lastAuditRound),
  };
}

export const fromPactsPrivate = (v: Raw): Record<string, PactPrivateNode> => rec(v, fromPactPrivate);

function fromFirmState(v: Raw): FirmState {
  const o = obj(v);
  return {
    id: str(o.id),
    ticker: str(o.ticker),
    order: num(o.order),
    isBot: bool(o.isBot),
    botPolicy: strOrNull(o.botPolicy) as FirmState['botPolicy'],
    cash: num(o.cash),
    cap: num(o.cap),
    lastCard: str(o.lastCard, 'NONE') as Card,
    lastPoachTarget: strOrNull(o.lastPoachTarget),
    lastPace: num(o.lastPace, 2) as Pace,
    lastSafety: num(o.lastSafety),
    cumulativeDraw: num(o.cumulativeDraw),
    incidents: num(o.incidents),
    insolvent: bool(o.insolvent),
    valuation: num(o.valuation),
    peakValuation: num(o.peakValuation),
    rank: num(o.rank),
    breachUntilRound: num(o.breachUntilRound),
  };
}

function fromRoundRecord(v: Raw): RoundRecord {
  const o = obj(v);
  return {
    round: num(o.round),
    T: num(o.T),
    dT: num(o.dT),
    M: num(o.M),
    collapsed: bool(o.collapsed),
    incidents: num(o.incidents),
    headlines: arr(o.headlines, fromHeadline),
    audits: arr(o.audits, fromAudit),
    disclosure: fromDisclosure(o.disclosure),
    firms: rec(o.firms, fromFirmRoundResult),
    incidentDraws: arr(o.incidentDraws, (x) => num(x)),
    incidentFirms: arr(o.incidentFirms, (x) => str(x)),
  };
}

/** Params come back whole: missing keys (never expected) fall back to the defaults. */
function fromParams(v: Raw): Params {
  const o = obj(v);
  const out: Record<string, unknown> = {};
  for (const [k, d] of Object.entries(PARAMS)) {
    const x = o[k];
    if (Array.isArray(d)) out[k] = x === undefined ? d : arr(x, (n) => num(n));
    else if (isObj(d)) out[k] = { ...d, ...obj(x) };
    else out[k] = x === undefined ? d : x;
  }
  return out as unknown as Params;
}

function fromCounterfactual(v: Raw): CounterfactualResult | null {
  if (!isObj(v)) return null;
  return {
    rounds: num(v.rounds),
    industryTotal: num(v.industryTotal),
    perFirm: num(v.perFirm),
    byFirm: rec(v.byFirm, (x) => num(x)),
    trust: arr(v.trust, (x) => num(x)),
    collapseRound: numOrNull(v.collapseRound),
    incidentDraws: arr(v.incidentDraws, (r) => arr(r, (x) => num(x))),
  };
}

export function fromEngine(v: Raw): EngineNode | null {
  if (!isObj(v)) return null;
  return {
    seed: num(v.seed),
    label: str(v.label),
    round: num(v.round),
    T: num(v.T),
    M: num(v.M),
    collapsed: bool(v.collapsed),
    collapseRound: numOrNull(v.collapseRound),
    tau: num(v.tau),
    endMode: str(v.endMode, 'manual') as EndMode,
    endRound: numOrNull(v.endRound),
    disclosure: bool(v.disclosure),
    autoAuditP: num(v.autoAuditP),
    firms: arr(v.firms, fromFirmState),
    pacts: arr(v.pacts, (x) => fromPact(x, str(obj(x).id))),
    pactsPrivate: rec(v.pactsPrivate, fromPactPrivate),
    pendingAudits: arr(v.pendingAudits, (x) => str(x)),
    history: arr(v.history, fromRoundRecord),
    trustBand: num(v.trustBand),
    params: fromParams(v.params),
    rngNotes: strOrNull(v.rngNotes),
    cfCache: fromCounterfactual(v.cfCache),
  };
}

/** Splits the engine node back into the pure engine state. */
export function engineStateOf(e: EngineNode): EngineState {
  const { params: _p, rngNotes: _r, cfCache: _c, ...state } = e;
  return state;
}

export function fromResults(v: Raw): ResultsNode | null {
  if (!isObj(v)) return null;
  const cf = obj(v.counterfactual);
  return {
    rounds: num(v.rounds),
    collapseRound: numOrNull(v.collapseRound),
    tau: numOrNull(v.tau),
    startTrust: num(v.startTrust),
    trust: arr(v.trust, (x) => num(x)),
    final: rec(v.final, (x, k) => {
      const o = obj(x);
      return {
        firmId: k,
        ticker: str(o.ticker),
        isBot: bool(o.isBot),
        rank: num(o.rank),
        valuation: num(o.valuation),
        peakValuation: num(o.peakValuation),
        counterfactual: num(o.counterfactual),
        drawShare: num(o.drawShare),
        valueShare: num(o.valueShare),
        cumulativeDraw: num(o.cumulativeDraw),
        incidents: num(o.incidents),
        insolvent: bool(o.insolvent),
        detected: num(o.detected),
        undetected: num(o.undetected),
      };
    }),
    industry: {
      actual: num(obj(v.industry).actual),
      counterfactual: num(obj(v.industry).counterfactual),
      destroyed: num(obj(v.industry).destroyed),
    },
    counterfactual: {
      rounds: num(cf.rounds),
      industryTotal: num(cf.industryTotal),
      perFirm: num(cf.perFirm),
      byFirm: rec(cf.byFirm, (x) => num(x)),
      trust: arr(cf.trust, (x) => num(x)),
      collapseRound: numOrNull(cf.collapseRound),
    },
    attribution: arr(v.attribution, (x) => {
      const o = obj(x);
      return { firmId: str(o.firmId), drawShare: num(o.drawShare), valueShare: num(o.valueShare), cumulativeDraw: num(o.cumulativeDraw), valuation: num(o.valuation) };
    }),
    pacts: arr(v.pacts, (x) => {
      const o = obj(x);
      return {
        pactId: str(o.pactId),
        name: str(o.name),
        terms: fromTerms(o.terms),
        status: str(o.status, 'active') as Pact['status'],
        createdRound: num(o.createdRound),
        members: arr(o.members, (m) => str(m)),
        detected: num(o.detected),
        undetected: num(o.undetected),
        perFirm: rec(o.perFirm, (r) => ({ detected: num(obj(r).detected), undetected: num(obj(r).undetected) })),
        quarters: rec(o.quarters, (q) => str(q)),
      };
    }),
    contribution: fromContribution(v.contribution),
    dataLines: arr(v.dataLines, (x) => str(x)),
  };
}

const ledgerOf = (l: Record<string, unknown>): ConductLedger => ({
  publish: num(l.publish),
  share: num(l.share),
  restraint: num(l.restraint),
  compliant: num(l.compliant),
  poach: num(l.poach),
  blitz: num(l.blitz),
  lobby: num(l.lobby),
  rush: num(l.rush),
  breaches: num(l.breaches),
  incidents: num(l.incidents),
});

/** NET CONTRIBUTION (§10, Session 18); null in results written before it existed. */
export function fromContribution(v: Raw): Contribution | null {
  if (!isObj(v) || !isObj(v.firms)) return null;
  const m = isObj(v.moratorium) ? v.moratorium : null;
  return {
    firms: rec(v.firms, (x, k): FirmContribution => {
      const o = obj(x);
      const rv = obj(o.rivalry);
      const l = obj(o.ledger);
      return {
        firmId: k,
        ticker: str(o.ticker),
        valuation: num(o.valuation),
        valuationRank: num(o.valuationRank),
        trustPoints: num(o.trustPoints),
        marketEffect: num(o.marketEffect),
        shareBenefit: num(o.shareBenefit),
        moratoriumShare: num(o.moratoriumShare),
        researchCredit: num(o.researchCredit),
        rivalry: { blitz: num(rv.blitz), poach: num(rv.poach), rush: num(rv.rush) },
        rivalryTaken: num(o.rivalryTaken),
        valueCreated: num(o.valueCreated),
        damageCreated: num(o.damageCreated),
        netContribution: num(o.netContribution),
        rank: num(o.rank),
        ledger: ledgerOf(l),
      };
    }),
    moratorium: m
      ? { round: num(m.round), revenue: num(m.revenue), cash: num(m.cash), capability: num(m.capability), total: num(m.total), allocated: num(m.allocated) }
      : null,
    researchCreditPerCard: num(v.researchCreditPerCard),
  };
}
