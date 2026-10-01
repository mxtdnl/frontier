/** DATA lines (spec §8.4) and the public exposure label (§6.5). */
import { byPace, type Params } from './params';
import type { Card, ExposureLabel, FirmRoundResult, FirmState, Pace } from './types';

/** LOW < cut0 ≤ MED < cut1 ≤ HIGH < cut2 ≤ SEVERE, on d_i. */
export function exposureLabel(expo: number, p: Params): ExposureLabel {
  const [a, b, c] = p.EXPO_CUTS;
  if (expo < a) return 'LOW';
  if (expo < b) return 'MED';
  if (expo < c) return 'HIGH';
  return 'SEVERE';
}

const f = (x: number, dp: number): string => {
  const s = x.toFixed(dp);
  return s === `-${(0).toFixed(dp)}` ? (0).toFixed(dp) : s;
};
const b = (x: boolean): string => (x ? '1' : '0');

export interface DataLineRound {
  label: string;
  round: number;
  T: number;
  M: number;
  collapsed: boolean;
}

/** One line per firm per round. `draw` is the firm's trust draw d_i × 8/N. */
export function dataLine(g: DataLineRound, firm: Pick<FirmState, 'ticker' | 'isBot'>, r: FirmRoundResult): string {
  return [
    'DATA',
    `game=${g.label}`,
    `round=${g.round}`,
    `T=${f(g.T, 2)}`,
    `M=${f(g.M, 1)}`,
    `collapsed=${b(g.collapsed)}`,
    `firm=${firm.ticker}`,
    `bot=${b(firm.isBot)}`,
    `pace=${r.pace}`,
    `safety=${r.safety}`,
    `card=${r.card}`,
    `share=${f(r.share, 3)}`,
    `rev=${f(r.revenue, 1)}`,
    `cost=${f(r.cost, 1)}`,
    `profit=${f(r.profit, 1)}`,
    `cash=${f(r.cash, 1)}`,
    `cap=${f(r.cap, 1)}`,
    `val=${f(r.valuation, 1)}`,
    `draw=${f(r.draw, 2)}`,
    `incident=${b(r.incident)}`,
    `auto=${b(r.auto)}`,
  ].join('|');
}

/** d_i for a prospective decision, for the participant's exposure label (§6.5). */
export function exposureOf(pace: Pace, safety: number, p: Params): number {
  return byPace(p.DRAW, pace) * (1 - p.SAFETY_DRAW_EFF * (safety / p.SAFETY_MAX));
}

/** Deterministic estimated cost: compute + safety + card (§6.5). */
export function estimatedCost(pace: Pace, safety: number, card: Card, p: Params): number {
  return byPace(p.COMPUTE_COST, pace) + safety * p.BUDGET_REF + p.CARD_COST[card];
}
