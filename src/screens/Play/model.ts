/**
 * Pure helpers for the participant control centre (spec §14.3). No Firebase and no React,
 * so every rule here is unit-tested.
 */
import {
  PARAMS,
  estimatedCost,
  exposureLabel,
  exposureOf,
  type AuditResult,
  type Card,
  type ExposureLabel,
  type FirmRoundResult,
  type Pace,
  type Pact,
} from '../../engine';
import type { DecisionNode, FirmNode, NoticeEntry, PublicNode, RoundNode, WireNode } from '../../firebase/schema';
import { mergeWire } from '../../firebase/wire';
import { quarterLabel } from '../../ui/format';

export const PACE_OPTIONS = [
  { value: 1, label: '1', sub: 'Cautious' },
  { value: 2, label: '2', sub: 'Standard' },
  { value: 3, label: '3', sub: 'Aggressive' },
  { value: 4, label: '4', sub: 'Breakneck' },
] as const;

/** Card costs come from the engine parameters; the wording follows spec §5.2. */
export const CARD_INFO: ReadonlyArray<{ id: Card; name: string; cost: number; effect: string }> = [
  { id: 'NONE', name: 'No card', cost: PARAMS.CARD_COST.NONE, effect: 'Play nothing this quarter.' },
  { id: 'POACH', name: 'Poach talent', cost: PARAMS.CARD_COST.POACH, effect: 'Take capability from a target firm. Needs a target.' },
  { id: 'PUBLISH', name: 'Publish safety research', cost: PARAMS.CARD_COST.PUBLISH, effect: 'Raises public trust. Lowers your incident risk this quarter.' },
  { id: 'LOBBY', name: 'Lobby regulators', cost: PARAMS.CARD_COST.LOBBY, effect: 'Exempt from pact fines detected this quarter. Lowers public trust.' },
  { id: 'BLITZ', name: 'Marketing blitz', cost: PARAMS.CARD_COST.BLITZ, effect: 'Raises your effective capability this quarter only.' },
];

export interface Draft {
  pace: Pace;
  safety: number;
  card: Card;
  /** POACH target firm id. */
  target: string | null;
}

/** Spec §6.4 defaults: the previous quarter's applied values; round 1 is pace 2, safety 10. */
export function initialDraft(
  decision: Pick<DecisionNode, 'pace' | 'safety' | 'card' | 'target'> | null,
  previous: Pick<FirmRoundResult, 'pace' | 'safety'> | null,
): Draft {
  if (decision) return { pace: decision.pace, safety: decision.safety, card: decision.card, target: decision.card === 'POACH' ? decision.target : null };
  if (previous) return { pace: previous.pace, safety: previous.safety, card: 'NONE', target: null };
  return { pace: 2, safety: 10, card: 'NONE', target: null };
}

/** True when the card cannot be played this quarter (spec §5.2). */
export function cardBlocked(card: Card, lastCard: Card | null, insolvent: boolean): boolean {
  if (card === 'NONE') return false;
  return insolvent || card === lastCard;
}

/** Drops a card or target that is no longer legal, so the desk never offers an invalid commit. */
export function legalDraft(d: Draft, lastCard: Card | null, lastTarget: string | null, insolvent: boolean): Draft {
  if (cardBlocked(d.card, lastCard, insolvent)) return { ...d, card: 'NONE', target: null };
  if (d.card === 'POACH' && d.target !== null && d.target === lastTarget) return { ...d, target: null };
  return d;
}

export const canCommit = (d: Draft): boolean => d.card !== 'POACH' || d.target !== null;

export const sameDraft = (a: Draft, b: Draft): boolean =>
  a.pace === b.pace && a.safety === b.safety && a.card === b.card && (a.card !== 'POACH' || a.target === b.target);

export interface DeskFigures {
  cost: number;
  exposure: ExposureLabel;
}

export function deskFigures(d: Draft): DeskFigures {
  return {
    cost: estimatedCost(d.pace, d.safety, d.card, PARAMS),
    exposure: exposureLabel(exposureOf(d.pace, d.safety, PARAMS), PARAMS),
  };
}

/** POACH choices: every other firm, bots included. Selection is keyed by ticker in the picker. */
export function poachTargets(firms: Record<string, FirmNode>, ownFirmId: string): Array<{ id: string; ticker: string; name: string }> {
  return Object.entries(firms)
    .filter(([id]) => id !== ownFirmId)
    .map(([id, f]) => ({ id, ticker: f.ticker, name: f.name }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export type PlayView = 'lobby' | 'briefing' | 'open' | 'paused' | 'closed' | 'resolving' | 'reveal' | 'summit' | 'ended';

/** What the participant sees now. `nowMs` is server time. */
export function playView(pub: PublicNode, nowMs: number): PlayView {
  switch (pub.phase) {
    case 'lobby':
    case 'briefing':
    case 'resolving':
    case 'reveal':
    case 'summit':
    case 'ended':
      return pub.phase;
    case 'open':
      if (pub.paused || pub.deadline === null) return 'paused';
      return nowMs >= pub.deadline ? 'closed' : 'open';
  }
}

export interface BookRow extends FirmRoundResult {
  round: number;
}

/** The firm's own history, oldest first. */
export function bookRows(history: Record<string, FirmRoundResult>): BookRow[] {
  return Object.entries(history)
    .map(([r, v]) => ({ ...v, round: Number(r) }))
    .filter((r) => Number.isInteger(r.round) && r.round > 0)
    .sort((a, b) => a.round - b.round);
}

const CARD_NAME: Record<Card, string> = { NONE: 'No card', POACH: 'POACH', PUBLISH: 'PUBLISH', LOBBY: 'LOBBY', BLITZ: 'BLITZ' };

/** Why a requested card was dropped (spec §6.3 step 2). The card did not run and cost nothing. */
export function cardNoticeText(n: NoticeEntry): string {
  const name = CARD_NAME[n.card];
  switch (n.kind) {
    case 'card-insolvent':
      return `${name} was not played. Insolvent firms cannot play cards.`;
    case 'card-cooldown':
      return `${name} was not played. The same card cannot repeat in consecutive quarters.`;
    case 'card-target':
      return `${name} was not played. It needs a valid target firm.`;
    case 'card-target-repeat':
      return `${name} was not played. The target cannot be the same two quarters running.`;
  }
}

export interface ResultNotice {
  text: string;
  /** `alert` (card dropped, incident, insolvency, breach) or `info`. Drives the left rule's colour. */
  kind: 'alert' | 'info';
}

/** Notices on the quarter result card. Only the firm's own outcome and audits naming it. */
export function resultNoticeItems(
  result: FirmRoundResult,
  audits: ReadonlyArray<AuditResult>,
  pacts: Record<string, Pact>,
  firmId: string,
  cards: ReadonlyArray<NoticeEntry> = [],
): ResultNotice[] {
  const out: ResultNotice[] = cards.map((n) => ({ text: cardNoticeText(n), kind: 'alert' }));
  if (result.auto) out.push({ text: 'No decision was received. Last quarter’s settings were applied.', kind: 'alert' });
  if (result.incident) out.push({ text: 'Incident reported against the firm. Revenue was reduced this quarter.', kind: 'alert' });
  if (result.insolvent) out.push({ text: 'Insolvent. Action cards are unavailable until cash is positive.', kind: 'alert' });
  for (const a of audits) {
    const b = a.breaches.find((x) => x.firmId === firmId);
    if (!b) continue;
    const name = pacts[a.pactId]?.name ?? 'Pact';
    out.push({
      text: `${name} audit found a breach. ${b.waived ? 'Fine waived.' : `Fine ${b.fine.toFixed(1)}.`}${b.expelled ? ' Firm removed from the pact.' : ''}`,
      kind: 'alert',
    });
  }
  if (out.length === 0) out.push({ text: 'No notices this quarter.', kind: 'info' });
  return out;
}

export function resultNotices(
  result: FirmRoundResult,
  audits: ReadonlyArray<AuditResult>,
  pacts: Record<string, Pact>,
  firmId: string,
  cards: ReadonlyArray<NoticeEntry> = [],
): string[] {
  return resultNoticeItems(result, audits, pacts, firmId, cards).map((n) => n.text);
}

export interface WireItem {
  round: number;
  label: string;
  text: string;
}

/** Resolved headlines and live events (pacts, disclosure), newest first. */
export function wireItems(rounds: Record<string, RoundNode>, wire: Record<string, WireNode> = {}): WireItem[] {
  return mergeWire(rounds, wire).map((h) => ({ round: h.round, label: h.round > 0 ? quarterLabel(h.round) : 'PRE', text: h.text }));
}

/** Share change in percentage points against the previous quarter; null when unknown. */
export function shareChangePp(history: Record<string, FirmRoundResult>, round: number): number | null {
  const now = history[String(round)];
  const before = history[String(round - 1)];
  if (!now || !before) return null;
  return (now.share - before.share) * 100;
}

/** Exposure labels in meter order (spec §14.3): the meter fills up to the current step. */
export const EXPOSURE_STEPS: ReadonlyArray<ExposureLabel> = ['LOW', 'MED', 'HIGH', 'SEVERE'];

/** 1 to 4: how many meter steps are filled for the label. */
export const exposureStep = (label: ExposureLabel): number => EXPOSURE_STEPS.indexOf(label) + 1;

/** "2nd", "11th". Local copy keeps this module free of chart code. */
function nth(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

export interface ResultSentence {
  /** The whole sentence in words, for assistive technology and tests. */
  text: string;
  /** "You ranked 2nd of 9". */
  head: string;
  /** Rank movement: positive is up, 0 is no change. The component draws a ▲ or ▼ for a non-zero value. */
  move: number;
  /** Quarter 1 has no previous rank, so no movement is stated. */
  hasMovement: boolean;
  /** "Profit 57.7." or "Loss 12.4." */
  tail: string;
}

/**
 * The line that opens a quarter result (spec §14.3): "You ranked 2nd of 9, ▲1. Profit 57.7."
 * `move` is the engine's `rankDelta` (previous rank minus rank, so positive is up).
 */
export function resultSentence(r: Pick<FirmRoundResult, 'rank' | 'rankDelta' | 'profit'>, firmCount: number, round: number): ResultSentence {
  const head = `You ranked ${nth(r.rank)} of ${firmCount}`;
  const hasMovement = round > 1;
  const move = hasMovement ? r.rankDelta : 0;
  const movement = !hasMovement ? '' : move === 0 ? ', unchanged' : `, ${move > 0 ? 'up' : 'down'} ${Math.abs(move)}`;
  const rounded = Number(Math.abs(r.profit).toFixed(1));
  const tail = r.profit < 0 && rounded !== 0 ? `Loss ${rounded.toFixed(1)}.` : `Profit ${rounded.toFixed(1)}.`;
  return { text: `${head}${movement}. ${tail}`, head, move, hasMovement, tail };
}

export type CommitBarKind = 'idle' | 'committed' | 'dirty' | 'locked' | 'offline' | 'error';

export interface CommitBarInput {
  open: boolean;
  committed: boolean;
  dirty: boolean;
  offline: boolean;
  error: string;
  /** Wall-clock text of the commit (hh:mm:ss) and the device label; empty when not committed. */
  time: string;
  device: string;
  /** Why the desk is locked, when it is. */
  lockedText: string;
}

/** What the full-width commit bar says (spec §14.3). */
export function commitBar(i: CommitBarInput): { kind: CommitBarKind; text: string } {
  if (i.error) return { kind: 'error', text: i.error };
  if (i.offline && i.open) return { kind: 'offline', text: 'OFFLINE · reconnect to commit' };
  if (!i.open) {
    return { kind: 'locked', text: i.committed ? `COMMITTED ${i.time} · ${i.lockedText}` : `NOT COMMITTED · ${i.lockedText}` };
  }
  if (i.committed && i.dirty) return { kind: 'dirty', text: 'CHANGES NOT COMMITTED' };
  if (i.committed) return { kind: 'committed', text: `COMMITTED ${i.time} · edit until close · ${i.device}` };
  return { kind: 'idle', text: 'NOT COMMITTED' };
}
