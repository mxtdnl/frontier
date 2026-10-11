/**
 * NET CONTRIBUTION (spec §10, §14.4 panel 5; Session 18). What each firm's decisions did to the whole market, against
 * the ALTERNATIVE policy (pace 2, safety 15, no card). Pure and deterministic: computed from the stored engine history
 * with no replay, so switching one firm can never move the moratorium and swing everyone else's figures.
 *
 * Owner decisions 2026-10-10: the method as written in Session 18 Part C; the ALTERNATIVE's incident uses the firm's own
 * stored incident draw (common random numbers), so a firm that played the ALTERNATIVE has a market effect of exactly 0;
 * RESEARCH_CREDIT is 1.0 per PUBLISH card (display only; SHARE earns none, its benefit is in the market effect); BLITZ,
 * POACH and RUSH count as rivalry taken.
 */
import { drawMultiplier, incidentMultiplier, shareMultiplier } from './cards';
import { PARAMS, byPace, type Params } from './params';
import type { Card, EngineState, FirmRoundResult, RoundRecord } from './types';

export interface ConductLedger {
  /** For the market. */
  publish: number;
  share: number;
  /** Quarters at pace ≤ 2 and safety ≥ 15. */
  restraint: number;
  /** Quarters checked against a pact with 2 or more members that quarter, terms kept. */
  compliant: number;
  /** Against the market. */
  poach: number;
  blitz: number;
  lobby: number;
  rush: number;
  /** Quarters in breach of a pact's terms, detected or not. */
  breaches: number;
  incidents: number;
}

export interface FirmContribution {
  firmId: string;
  ticker: string;
  valuation: number;
  /** Rank by final valuation (the engine's rank). */
  valuationRank: number;
  /** Σ over quarters of the firm's trust effect against the ALTERNATIVE, in trust points (not valued). */
  trustPoints: number;
  /** Trust effect × value of a trust point, + SHARE benefit − moratorium share. */
  marketEffect: number;
  /** The SHARE benefit inside the market effect: trust loss SHARE saved the other firms, in expectation, valued. */
  shareBenefit: number;
  /** The share of the moratorium cost subtracted from the market effect. */
  moratoriumShare: number;
  /** Display only, never money (RESEARCH_CREDIT per PUBLISH card, valued like trust). */
  researchCredit: number;
  rivalry: { blitz: number; poach: number; rush: number };
  /** blitz + poach + rush. */
  rivalryTaken: number;
  /** valuation + max(0, market effect) + research credit. */
  valueCreated: number;
  /** max(0, −market effect) + rivalry taken. */
  damageCreated: number;
  /** valuation + market effect + research credit − rivalry taken. */
  netContribution: number;
  /** Rank by net contribution; ties by final cash, then creation order (the engine's tie-break). */
  rank: number;
  ledger: ConductLedger;
}

export interface MoratoriumCost {
  round: number;
  /** Market revenue lost to the moratorium multiplier, every quarter from the moratorium on. */
  revenue: number;
  /** Positive cash removed by the haircut. */
  cash: number;
  /** Capability value written down, at final trust. */
  capability: number;
  total: number;
  /** The part allocated to firms; less than `total` only when no firm had a negative effect by then. */
  allocated: number;
}

export interface Contribution {
  firms: Record<string, FirmContribution>;
  moratorium: MoratoriumCost | null;
  /** RESEARCH_CREDIT used, in trust-point equivalents per PUBLISH card before × 8/N. */
  researchCreditPerCard: number;
}

/** Market revenue per trust point in quarter t, for every quarter from t to the end (§10). */
export function trustPointValue(rec: Pick<RoundRecord, 'round' | 'T' | 'M'>, quartersPlayed: number, p: Params = PARAMS): number {
  if (!(rec.T > 0)) return 0;
  return ((p.GAMMA * rec.M) / rec.T) * (quartersPlayed - rec.round + 1);
}

/** q_i before the SHARE multiplier (§6.3 step 5). */
function ownRisk(r: Pick<FirmRoundResult, 'pace' | 'safety' | 'card'>, p: Params): number {
  return byPace(p.INC_BASE, r.pace) * (1 - p.SAFETY_INC_EFF * (r.safety / p.SAFETY_MAX)) * incidentMultiplier(r.card, p);
}

/** The firm's own terms of the §6.3 step 6 trust update this quarter, in trust points. */
function ownTrustTerms(r: FirmRoundResult, scale: number, p: Params): number {
  const incident = r.incident ? p.INC_TRUST * scale : 0;
  const publish = r.card === 'PUBLISH' ? p.PUBLISH_TRUST * scale : 0;
  const lobby = r.card === 'LOBBY' ? p.LOBBY_TRUST : 0;
  return -r.draw - incident + publish - lobby;
}

/**
 * The same terms for the ALTERNATIVE in the firm's place: its draw, and its incident on the firm's stored draw u_{t,i}
 * with the quarter's SHARE multiplier (other firms' SHARE cards only). Written with the engine's arithmetic, so a firm
 * that played the ALTERNATIVE matches it exactly.
 */
function alternativeTrustTerms(u: number, sharesByOthers: number, scale: number, p: Params): number {
  const alt = p.BOT_SUSTAINABLE;
  const sigma = alt.safety / p.SAFETY_MAX;
  const draw = byPace(p.DRAW, alt.pace) * (1 - p.SAFETY_DRAW_EFF * sigma) * drawMultiplier('NONE', p) * scale;
  const q = byPace(p.INC_BASE, alt.pace) * (1 - p.SAFETY_INC_EFF * sigma) * incidentMultiplier('NONE', p) * Math.pow(p.SHARE_INC_MULT, sharesByOthers);
  return -draw - (u < q ? p.INC_TRUST * scale : 0);
}

/** Revenue the firm's BLITZ took this quarter: its revenue minus its revenue without the multiplier, shares recomputed. */
export function blitzTaken(rec: RoundRecord, firmId: string, order: ReadonlyArray<string>, p: Params = PARAMS): number {
  const me = rec.firms[firmId];
  if (!me || me.card !== 'BLITZ') return 0;
  const weight = (id: string, card: Card): number => Math.pow((rec.firms[id]?.cap ?? 0) * shareMultiplier(card, p), p.ALPHA);
  const total = order.reduce((s, id) => s + weight(id, rec.firms[id]?.card ?? 'NONE'), 0);
  const without = weight(firmId, 'NONE');
  const totalWithout = total - weight(firmId, 'BLITZ') + without;
  const shareWithout = totalWithout > 0 ? without / totalWithout : 1 / order.length;
  const revenueWithout = shareWithout * rec.M * (me.incident ? 1 - p.INC_REV_LOSS : 1);
  return me.revenue - revenueWithout;
}

const emptyLedger = (): ConductLedger => ({ publish: 0, share: 0, restraint: 0, compliant: 0, poach: 0, blitz: 0, lobby: 0, rush: 0, breaches: 0, incidents: 0 });

export function computeContribution(state: EngineState, p: Params = PARAMS): Contribution {
  const firms = state.firms;
  const n = firms.length;
  const order = firms.map((f) => f.id);
  const scale = p.DRAW_REF_N / Math.max(1, n);
  const quarters = state.history.length;
  const finalCap = (p.CAP_MULT * state.T) / p.TRUST_MAX;
  const alt = p.BOT_SUSTAINABLE;

  const valued = new Map(order.map((id) => [id, 0]));
  const points = new Map(order.map((id) => [id, 0]));
  const shareBenefit = new Map(order.map((id) => [id, 0]));
  const research = new Map(order.map((id) => [id, 0]));
  const rivalry = new Map(order.map((id) => [id, { blitz: 0, poach: 0, rush: 0 }]));
  const ledger = new Map(order.map((id) => [id, emptyLedger()]));
  /** Market effect up to and including the moratorium quarter, for the allocation. */
  const toMoratorium = new Map(order.map((id) => [id, 0]));

  for (const rec of state.history) {
    const value = trustPointValue(rec, quarters, p);
    const shares = order.filter((id) => rec.firms[id]?.card === 'SHARE').length;
    firms.forEach((f, i) => {
      const r = rec.firms[f.id];
      if (!r) return;
      const u = rec.incidentDraws[i] ?? 1;
      const effect = ownTrustTerms(r, scale, p) - alternativeTrustTerms(u, shares - (r.card === 'SHARE' ? 1 : 0), scale, p);
      let money = effect * value;
      if (r.card === 'SHARE') {
        const saved = order.reduce((s, id) => {
          const o = rec.firms[id];
          return id === f.id || !o ? s : s + ownRisk(o, p) * (1 - p.SHARE_INC_MULT) * p.INC_TRUST * scale;
        }, 0);
        shareBenefit.set(f.id, (shareBenefit.get(f.id) ?? 0) + saved * value);
        money += saved * value;
      }
      points.set(f.id, (points.get(f.id) ?? 0) + effect);
      valued.set(f.id, (valued.get(f.id) ?? 0) + money);
      if (state.collapseRound !== null && rec.round <= state.collapseRound) toMoratorium.set(f.id, (toMoratorium.get(f.id) ?? 0) + money);
      if (r.card === 'PUBLISH') research.set(f.id, (research.get(f.id) ?? 0) + p.RESEARCH_CREDIT * scale * value);

      const rv = rivalry.get(f.id);
      if (rv) {
        rv.blitz += blitzTaken(rec, f.id, order, p);
        if (r.card === 'POACH' && r.target !== null) rv.poach += p.POACH_LOSS * finalCap;
        if (r.card === 'RUSH') rv.rush += p.RUSH_CAP_GAIN * finalCap;
      }
      const l = ledger.get(f.id);
      if (l) {
        if (r.card === 'PUBLISH') l.publish++;
        if (r.card === 'SHARE') l.share++;
        if (r.card === 'POACH') l.poach++;
        if (r.card === 'BLITZ') l.blitz++;
        if (r.card === 'LOBBY') l.lobby++;
        if (r.card === 'RUSH') l.rush++;
        if (r.pace <= alt.pace && r.safety >= alt.safety) l.restraint++;
        if (r.incident) l.incidents++;
      }
    });
  }

  // Pact conduct: compliant quarters in a pact of 2 or more checked members, and breaches.
  for (const pp of Object.values(state.pactsPrivate)) {
    for (const [round, checked] of Object.entries(pp.checked ?? {})) {
      if (Object.keys(checked).length < p.PACT_MIN_MEMBERS) continue;
      for (const id of Object.keys(checked)) {
        if (pp.violations[round]?.[id]) continue;
        const l = ledger.get(id);
        if (l) l.compliant++;
      }
    }
    for (const byFirm of Object.values(pp.violations)) {
      for (const id of Object.keys(byFirm)) {
        const l = ledger.get(id);
        if (l) l.breaches++;
      }
    }
  }
  // A firm in two pacts that kept both in one quarter counts that quarter once.
  for (const id of order) {
    const l = ledger.get(id);
    if (!l) continue;
    const rounds = new Set<string>();
    for (const pp of Object.values(state.pactsPrivate)) {
      for (const [round, checked] of Object.entries(pp.checked ?? {})) {
        if (Object.keys(checked).length >= p.PACT_MIN_MEMBERS && checked[id] && !pp.violations[round]?.[id]) rounds.add(round);
      }
    }
    l.compliant = rounds.size;
  }

  // The moratorium cost, allocated to firms whose market effect was negative by the moratorium quarter.
  let moratorium: MoratoriumCost | null = null;
  const allocation = new Map(order.map((id) => [id, 0]));
  if (state.collapseRound !== null) {
    const c = state.collapseRound;
    const revenue = state.history.filter((h) => h.collapsed).reduce((s, h) => s + (h.M / p.MORATORIUM_M - h.M), 0);
    const before = state.history.find((h) => h.round === c - 1);
    const cash = order.reduce((s, id) => s + Math.max(0, before ? (before.firms[id]?.cash ?? 0) : p.CASH0) * (1 - p.COLLAPSE_CASH_HAIRCUT), 0);
    const capability = firms.reduce((s, f) => s + p.CAP_MULT * f.cap * (state.T / p.TRUST_MAX) * (1 - p.COLLAPSE_CAP_WRITEDOWN), 0);
    const total = revenue + cash + capability;
    const negative = order.map((id) => Math.max(0, -(toMoratorium.get(id) ?? 0)));
    const sum = negative.reduce((a, b) => a + b, 0);
    if (sum > 0) order.forEach((id, i) => allocation.set(id, (total * (negative[i] ?? 0)) / sum));
    moratorium = { round: c, revenue, cash, capability, total, allocated: sum > 0 ? total : 0 };
  }

  const out: Record<string, FirmContribution> = {};
  for (const f of firms) {
    const moratoriumShare = allocation.get(f.id) ?? 0;
    const marketEffect = (valued.get(f.id) ?? 0) - moratoriumShare;
    const researchCredit = research.get(f.id) ?? 0;
    const rv = rivalry.get(f.id) ?? { blitz: 0, poach: 0, rush: 0 };
    const rivalryTaken = rv.blitz + rv.poach + rv.rush;
    out[f.id] = {
      firmId: f.id,
      ticker: f.ticker,
      valuation: f.valuation,
      valuationRank: f.rank,
      trustPoints: points.get(f.id) ?? 0,
      marketEffect,
      shareBenefit: shareBenefit.get(f.id) ?? 0,
      moratoriumShare,
      researchCredit,
      rivalry: rv,
      rivalryTaken,
      valueCreated: f.valuation + Math.max(0, marketEffect) + researchCredit,
      damageCreated: Math.max(0, -marketEffect) + rivalryTaken,
      netContribution: f.valuation + marketEffect + researchCredit - rivalryTaken,
      rank: 0,
      ledger: ledger.get(f.id) ?? emptyLedger(),
    };
  }
  [...firms]
    .sort((a, b) => (out[b.id]?.netContribution ?? 0) - (out[a.id]?.netContribution ?? 0) || b.cash - a.cash || a.order - b.order)
    .forEach((f, i) => {
      const c = out[f.id];
      if (c) c.rank = i + 1;
    });
  return { firms: out, moratorium, researchCreditPerCard: p.RESEARCH_CREDIT };
}
