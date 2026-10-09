/** Action cards (spec §5.2, §6.3 steps 2–3, 5, 6, 9). */
import type { Params } from './params';
import { CARDS, type Card, type Decision, type FirmState, type NoticeKind } from './types';

export interface CardCheck {
  card: Card;
  target: string | null;
  /** Why the requested card was converted to NONE; null if it stands. */
  invalid: NoticeKind | null;
}

/**
 * Step 2. Converts a card that breaks a constraint to NONE:
 * insolvency, the same card in consecutive quarters, and for POACH a missing,
 * unknown or self target, or the same target as the firm's previous POACH.
 */
export function validateCard(firm: FirmState, decision: Decision, firmIds: ReadonlySet<string>): CardCheck {
  const { card } = decision;
  if (card === 'NONE') return { card, target: null, invalid: null };
  const reject = (invalid: NoticeKind): CardCheck => ({ card: 'NONE', target: null, invalid });
  if (firm.insolvent) return reject('card-insolvent');
  if (card === firm.lastCard) return reject('card-cooldown');
  if (card === 'POACH') {
    const t = decision.target;
    if (t === null || t === firm.id || !firmIds.has(t)) return reject('card-target');
    if (t === firm.lastPoachTarget) return reject('card-target-repeat');
    return { card, target: t, invalid: null };
  }
  return { card, target: null, invalid: null };
}

/** Cards a firm may legally play this quarter (excluding POACH target checks). */
export function allowedCards(firm: FirmState): Card[] {
  if (firm.insolvent) return ['NONE'];
  return CARDS.filter((c) => c === 'NONE' || c !== firm.lastCard);
}

export function cardCost(card: Card, p: Params): number {
  return p.CARD_COST[card];
}

/** Step 3. RUSH capability gain, after pace growth and before POACH. */
export function rushGain(card: Card, p: Params): number {
  return card === 'RUSH' ? p.RUSH_CAP_GAIN : 0;
}

/** Step 3 (second half). Applies POACH in firm creation order after capability growth. */
export function applyPoach(firms: FirmState[], cards: ReadonlyArray<{ card: Card; target: string | null }>, p: Params): void {
  firms.forEach((firm, i) => {
    const c = cards[i];
    if (c?.card !== 'POACH' || c.target === null) return;
    const target = firms.find((f) => f.id === c.target);
    if (!target) return;
    firm.cap += p.POACH_GAIN;
    target.cap = Math.max(p.POACH_FLOOR, target.cap - p.POACH_LOSS);
  });
}

/** Step 4 multiplier on the firm's own draw d_i. */
export function drawMultiplier(card: Card, p: Params): number {
  return card === 'RUSH' ? p.RUSH_DRAW_MULT : 1;
}

/** Step 5 multiplier on the firm's own incident probability. */
export function incidentMultiplier(card: Card, p: Params): number {
  if (card === 'PUBLISH') return p.PUBLISH_INC_MULT;
  if (card === 'RUSH') return p.RUSH_INC_MULT;
  return 1;
}

/** Step 5 multiplier on every firm's incident probability: SHARE_INC_MULT per SHARE played. */
export function sharedIncidentMultiplier(cards: ReadonlyArray<Card>, p: Params): number {
  return Math.pow(p.SHARE_INC_MULT, cards.filter((c) => c === 'SHARE').length);
}

/**
 * Step 6 direct trust change from cards played this quarter. PUBLISH is scaled by
 * DRAW_REF_N / N like draw and incidents (owner decision, Session 17); LOBBY is not.
 */
export function cardTrustDelta(cards: ReadonlyArray<Card>, n: number, p: Params): number {
  let delta = 0;
  for (const c of cards) {
    if (c === 'PUBLISH') delta += p.PUBLISH_TRUST * (p.DRAW_REF_N / n);
    if (c === 'LOBBY') delta -= p.LOBBY_TRUST;
  }
  return delta;
}

/** Step 9 multiplier on effective capability. */
export function shareMultiplier(card: Card, p: Params): number {
  return card === 'BLITZ' ? p.BLITZ_MULT : 1;
}
