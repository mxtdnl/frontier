/**
 * Headlines published outside resolution (spec §5.3, §9.3): a pact formed, joined or left,
 * and the disclosure toggle. Pure functions; the facilitator window writes the result to
 * `wire/{key}`.
 *
 * Pact events are derived from the current pacts, not from a diff, so a window opened late
 * or refreshed mid-quarter still publishes everything that is missing. Keys are
 * deterministic, so two open windows write the same entries instead of duplicates.
 */
import { disclosureHeadline, hash32, pactFormedHeadline, pactJoinedHeadline, pactLeftHeadline, type Headline, type Pact } from '../engine';
import type { FirmNode, PublicNode, RoundNode, WireNode } from './schema';

/** Position of a live event among resolved headlines (see `WireNode.seq`). */
export function wireSeq(pub: Pick<PublicNode, 'phase' | 'round' | 'resumePhase'>): number {
  const resolved = pub.phase === 'reveal' || pub.phase === 'ended' || (pub.phase === 'summit' && pub.resumePhase === 'reveal');
  return resolved ? pub.round : pub.round - 0.5;
}

/** Template choice in [0, 1) from the key, so repeated writes of one event are identical. */
const choice = (key: string): number => hash32(key) / 0x100000000;

export const formedKey = (pact: string): string => `f-${pact}`;
export const joinedKey = (pact: string, firm: string, joined: number): string => `j-${pact}-${firm}-${joined}`;
export const leftKey = (pact: string, firm: string, joined: number): string => `l-${pact}-${firm}-${joined}`;

export function wireEntry(h: Headline, pub: Pick<PublicNode, 'phase' | 'round' | 'resumePhase'>, now: number, ref?: { pact: string; firm: string; joined: number }): WireNode {
  return {
    at: now,
    round: pub.round,
    seq: wireSeq(pub),
    kind: h.kind,
    text: h.text,
    pact: ref?.pact ?? null,
    firm: ref?.firm ?? null,
    joined: ref?.joined ?? null,
  };
}

export function disclosureEntry(on: boolean, pub: Pick<PublicNode, 'phase' | 'round' | 'resumePhase'>, now: number): WireNode {
  return wireEntry(disclosureHeadline(on), pub, now);
}

export interface WireInput {
  pacts: Record<string, Pact>;
  firms: Record<string, FirmNode>;
  rounds: Record<string, RoundNode>;
  wire: Record<string, WireNode>;
  pub: Pick<PublicNode, 'phase' | 'round' | 'resumePhase'>;
  now: number;
}

/** Entries that should exist but do not yet, keyed by their `wire/` key. */
export function pendingWire(input: WireInput): Record<string, WireNode> {
  const { pacts, firms, rounds, wire, pub, now } = input;
  const out: Record<string, WireNode> = {};
  const tick = (id: string): string | null => firms[id]?.ticker ?? null;
  const add = (key: string, h: Headline, ref: { pact: string; firm: string; joined: number }): void => {
    if (!(key in wire) && !(key in out)) out[key] = wireEntry(h, pub, now, ref);
  };
  const expelled = (pact: string, firm: string): boolean =>
    Object.values(rounds).some((r) => r.audits.some((a) => a.pactId === pact && a.breaches.some((b) => b.firmId === firm && b.expelled)));

  for (const pact of Object.values(pacts)) {
    if (pact.status !== 'active') continue;
    const proposer = tick(pact.proposer);
    if (proposer) {
      const key = formedKey(pact.id);
      add(key, pactFormedHeadline([proposer], pact.name, choice(key)), { pact: pact.id, firm: pact.proposer, joined: pact.createdRound });
    }
    for (const [firm, joined] of Object.entries(pact.members)) {
      if (firm === pact.proposer && joined === pact.createdRound) continue;
      const t = tick(firm);
      if (!t) continue;
      const key = joinedKey(pact.id, firm, joined);
      add(key, pactJoinedHeadline(t, pact.name, choice(key)), { pact: pact.id, firm, joined });
    }
  }

  // A published join whose membership is gone (or was replaced by a later join) is a departure.
  for (const e of Object.values(wire)) {
    if (e.pact === null || e.firm === null || e.joined === null) continue;
    if (e.kind !== 'pact-formed' && e.kind !== 'pact-joined') continue;
    const pact = pacts[e.pact];
    if (!pact || pact.status !== 'active' || pact.members[e.firm] === e.joined) continue;
    const t = tick(e.firm);
    const key = leftKey(e.pact, e.firm, e.joined);
    if (!t || expelled(e.pact, e.firm)) continue;
    add(key, pactLeftHeadline(t, pact.name, choice(key)), { pact: e.pact, firm: e.firm, joined: e.joined });
  }
  return out;
}

export interface FeedItem {
  /** Quarter the item is labelled with; 0 before the first quarter. */
  round: number;
  kind: Headline['kind'];
  text: string;
  /** Sort position, newest first. */
  seq: number;
}

/**
 * Resolved headlines and live events as one feed, newest first. A live event follows the
 * headlines of the quarter it came after and precedes those of the quarter it came before.
 */
export function mergeWire(rounds: Record<string, RoundNode>, wire: Record<string, WireNode>): FeedItem[] {
  const resolved: FeedItem[] = [];
  const nums = Object.keys(rounds)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => b - a);
  for (const n of nums) {
    for (const h of rounds[String(n)]?.headlines ?? []) resolved.push({ round: n, kind: h.kind, text: h.text, seq: n });
  }
  const live = Object.entries(wire)
    .sort(([ka, a], [kb, b]) => b.at - a.at || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .map(([, e]): FeedItem => ({ round: e.round, kind: e.kind, text: e.text, seq: e.seq }));
  // Stable merge: within one position, live events (newer) come before resolved headlines.
  return [...live, ...resolved].map((item, i) => ({ item, i })).sort((a, b) => b.item.seq - a.item.seq || a.i - b.i).map((x) => x.item);
}

/** Headline kinds that report harm (incidents, breaches, insolvency, the moratorium); the ticker marks them ▼. */
const ALARM_KINDS: ReadonlySet<Headline['kind']> = new Set<Headline['kind']>(['incident', 'breach', 'insolvency', 'collapse', 'moratorium']);
export const isAlarmKind = (kind: string): boolean => ALARM_KINDS.has(kind as Headline['kind']);

/** Short uppercase label per headline kind, for the facilitator wire screen (§14.2, Session 18). */
const WIRE_KIND_LABEL: Readonly<Record<Headline['kind'], string>> = {
  collapse: 'MORAT',
  moratorium: 'MORAT',
  final: 'CLOSE',
  breach: 'BREACH',
  'audit-clean': 'AUDIT',
  insolvency: 'INSOLV',
  incident: 'INCID',
  rank: 'RANK',
  publish: 'PUBLISH',
  lobby: 'LOBBY',
  poach: 'POACH',
  blitz: 'BLITZ',
  share: 'SHARE',
  rush: 'RUSH',
  pace4: 'PACE',
  'trust-band': 'POLL',
  ambient: 'NEWS',
  'pact-formed': 'PACT',
  'pact-joined': 'PACT',
  'pact-left': 'PACT',
  'disclosure-on': 'DISCL',
  'disclosure-off': 'DISCL',
};

export const wireKindLabel = (kind: string): string => WIRE_KIND_LABEL[kind as Headline['kind']] ?? kind.toUpperCase().slice(0, 7);
