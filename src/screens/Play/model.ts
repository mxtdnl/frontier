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
  type Headline,
  type Pace,
  type Pact,
} from '../../engine';
import type { DecisionNode, FirmNode, PublicNode, RoundNode } from '../../firebase/schema';
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

/** Notices on the quarter result card. Only the firm's own outcome and audits naming it. */
export function resultNotices(
  result: FirmRoundResult,
  audits: ReadonlyArray<AuditResult>,
  pacts: Record<string, Pact>,
  firmId: string,
): string[] {
  const out: string[] = [];
  if (result.auto) out.push('No decision was received. Last quarter’s settings were applied.');
  if (result.incident) out.push('Incident reported against the firm. Revenue was reduced this quarter.');
  if (result.insolvent) out.push('Insolvent. Action cards are unavailable until cash is positive.');
  for (const a of audits) {
    const b = a.breaches.find((x) => x.firmId === firmId);
    if (!b) continue;
    const name = pacts[a.pactId]?.name ?? 'Pact';
    out.push(
      `${name} audit found a breach. ${b.waived ? 'Fine waived.' : `Fine ${b.fine.toFixed(1)}.`}${b.expelled ? ' Firm removed from the pact.' : ''}`,
    );
  }
  if (out.length === 0) out.push('No notices this quarter.');
  return out;
}

export interface WireItem {
  round: number;
  label: string;
  text: string;
}

/** Headlines from every resolved quarter, newest quarter first. */
export function wireItems(rounds: Record<string, RoundNode>): WireItem[] {
  const out: WireItem[] = [];
  const nums = Object.keys(rounds)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => b - a);
  for (const n of nums) {
    const hs: ReadonlyArray<Headline> = rounds[String(n)]?.headlines ?? [];
    for (const h of hs) out.push({ round: n, label: quarterLabel(n), text: h.text });
  }
  return out;
}

/** Share change in percentage points against the previous quarter; null when unknown. */
export function shareChangePp(history: Record<string, FirmRoundResult>, round: number): number | null {
  const now = history[String(round)];
  const before = history[String(round - 1)];
  if (!now || !before) return null;
  return (now.share - before.share) * 100;
}
