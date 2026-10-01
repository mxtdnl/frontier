/**
 * Game creation and quarter resolution (spec §6.3). Pure and deterministic: the only
 * randomness comes from rng.ts streams seeded by (game seed, round, stream).
 */
import { applyPoach, cardCost, cardTrustDelta, incidentMultiplier, shareMultiplier, validateCard } from './cards';
import { dataLine } from './data';
import { roundHeadlines, trustBand } from './headlines';
import { disclosureSnapshot, dissolvePacts, recordViolations, runAudits } from './pacts';
import { PARAMS, byPace, type Params } from './params';
import { botDecision } from './policies';
import { randInt, streamRng } from './rng';
import {
  CARDS,
  type Card,
  type Decision,
  type EngineState,
  type FirmInit,
  type FirmRoundResult,
  type FirmState,
  type GameSettings,
  type Notice,
  type Pace,
  type ResolveResult,
  type RoundOutputs,
  type RoundRecord,
} from './types';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * Initial state. τ and endRound are drawn once from the `setup` stream (round 0).
 * Both draws are always taken so the stream layout never depends on settings.
 */
export function createGame(settings: GameSettings, firms: ReadonlyArray<FirmInit>, seed: number, p: Params = PARAMS): EngineState {
  const rng = streamRng(seed, 0, 'setup');
  const uTau = rng();
  const tau = p.TAU_MIN + uTau * (p.TAU_MAX - p.TAU_MIN);
  const maxEnd = Math.min(settings.maxEnd, p.MAX_ROUNDS);
  const minEnd = Math.min(settings.minEnd, maxEnd);
  const randomEnd = randInt(rng, minEnd, maxEnd);
  const endRound =
    settings.endMode === 'random'
      ? randomEnd
      : settings.endMode === 'fixed'
        ? clamp(settings.fixedEnd ?? p.MAX_ROUNDS, 1, p.MAX_ROUNDS)
        : null;
  const T = p.T0;
  const N = firms.length;
  const M = p.M_PER_FIRM * N * Math.pow(T / p.TRUST_MAX, p.GAMMA);
  const firmStates: FirmState[] = firms.map((f, i) => {
    const valuation = p.CASH0 + p.CAP_MULT * p.C0 * (T / p.TRUST_MAX);
    return {
      id: f.id,
      ticker: f.ticker,
      order: i,
      isBot: f.isBot,
      botPolicy: f.isBot ? f.botPolicy : null,
      cash: p.CASH0,
      cap: p.C0,
      lastCard: 'NONE',
      lastPoachTarget: null,
      lastPace: p.DEFAULT_PACE,
      lastSafety: p.DEFAULT_SAFETY,
      cumulativeDraw: 0,
      incidents: 0,
      insolvent: false,
      valuation,
      peakValuation: valuation,
      rank: i + 1,
      breachUntilRound: 0,
    };
  });
  return {
    seed: seed >>> 0,
    label: settings.label,
    round: 0,
    T,
    M,
    collapsed: false,
    collapseRound: null,
    tau,
    endMode: settings.endMode,
    endRound,
    disclosure: settings.disclosure,
    autoAuditP: settings.autoAuditP,
    firms: firmStates,
    pacts: [],
    pactsPrivate: {},
    pendingAudits: [],
    history: [],
    trustBand: trustBand(T, p),
  };
}

/** Coerces a submitted decision into range. The database rules validate first; this is defensive. */
export function sanitizeDecision(d: Decision, firm: FirmState, p: Params): Decision {
  const pace: Pace = d.pace === 1 || d.pace === 2 || d.pace === 3 || d.pace === 4 ? d.pace : firm.lastPace;
  const raw = Number.isFinite(d.safety) ? Math.round(d.safety) : firm.lastSafety;
  const card: Card = CARDS.includes(d.card) ? d.card : 'NONE';
  return { pace, safety: clamp(raw, 0, p.SAFETY_MAX), card, target: typeof d.target === 'string' ? d.target : null };
}

/** True when `round` is the hidden end round or the hard maximum. */
export function isFinalRound(state: Pick<EngineState, 'endMode' | 'endRound'>, round: number, p: Params = PARAMS): boolean {
  return round >= p.MAX_ROUNDS || (state.endMode !== 'manual' && state.endRound !== null && round >= state.endRound);
}

interface Applied {
  pace: Pace;
  safety: number;
  sigma: number;
  card: Card;
  target: string | null;
  auto: boolean;
}

/**
 * Resolves one quarter, steps 1–16 of §6.3. `decisions` holds committed decisions by
 * firm id; firms without one take bot policy (bots) or defaults (§6.4).
 */
export function resolveRound(
  state: EngineState,
  decisions: Readonly<Record<string, Decision | undefined>>,
  p: Params = PARAMS,
): ResolveResult {
  const s: EngineState = structuredClone(state);
  const round = s.round + 1;
  const N = s.firms.length;
  const scale = p.DRAW_REF_N / N;
  const firmIds = new Set(s.firms.map((f) => f.id));

  // 1. Defaults. Every firm consumes one `bot` draw so draws are indexed by firm order.
  const botRng = streamRng(s.seed, round, 'bot');
  const botU = s.firms.map(() => botRng());
  const requested: Array<{ d: Decision; auto: boolean }> = s.firms.map((f, i) => {
    const given = decisions[f.id];
    if (given) return { d: sanitizeDecision(given, f, p), auto: false };
    if (f.isBot && f.botPolicy) return { d: botDecision(f.botPolicy, f, state, botU[i] ?? 0, p), auto: false };
    return { d: { pace: f.lastPace, safety: f.lastSafety, card: 'NONE', target: null }, auto: true };
  });

  // 2. Validate cards.
  const notices: Notice[] = [];
  const applied: Applied[] = s.firms.map((f, i) => {
    const { d, auto } = requested[i] ?? { d: { pace: p.DEFAULT_PACE, safety: p.DEFAULT_SAFETY, card: 'NONE', target: null }, auto: true };
    const pace: Pace = f.insolvent ? 1 : d.pace;
    const check = validateCard(f, d, firmIds);
    if (check.invalid) notices.push({ firmId: f.id, kind: check.invalid, card: d.card });
    return { pace, safety: d.safety, sigma: d.safety / p.SAFETY_MAX, card: check.card, target: check.target, auto };
  });
  const at = (i: number): Applied => {
    const a = applied[i];
    if (!a) throw new Error(`resolveRound: no decision for firm ${i}`);
    return a;
  };

  // 3. Capability, then POACH.
  s.firms.forEach((f, i) => {
    const a = at(i);
    f.cap += byPace(p.CAP_GAIN, a.pace) * (1 - p.SAFETY_CAP_DRAG * a.sigma);
  });
  applyPoach(s.firms, applied, p);

  // 4. Trust draw.
  const expo = applied.map((a) => byPace(p.DRAW, a.pace) * (1 - p.SAFETY_DRAW_EFF * a.sigma));
  const draw = expo.map((d) => d * scale);
  const D = draw.reduce((x, y) => x + y, 0);
  s.firms.forEach((f, i) => {
    f.cumulativeDraw += draw[i] ?? 0;
  });

  // 5. Incidents. One `incident` draw per firm in creation order (common random numbers).
  const incRng = streamRng(s.seed, round, 'incident');
  const incidentDraws = s.firms.map(() => incRng());
  const incident = applied.map((a, i) => {
    const q = byPace(p.INC_BASE, a.pace) * (1 - p.SAFETY_INC_EFF * a.sigma) * incidentMultiplier(a.card, p);
    return (incidentDraws[i] ?? 1) < q;
  });
  const incidentCount = incident.filter(Boolean).length;
  const I = incidentCount * p.INC_TRUST * scale;
  s.firms.forEach((f, i) => {
    if (incident[i]) f.incidents += 1;
  });

  // 6. Trust update.
  const T0 = s.T;
  const Reff = s.collapsed ? p.R * p.MORATORIUM_R : p.R;
  const cards = applied.map((a) => a.card);
  let T = clamp(T0 + Reff * T0 * (1 - T0 / p.TRUST_MAX) - D - I + cardTrustDelta(cards, p), 0, p.TRUST_MAX);

  // 7. Collapse check. Negative cash is not haircut (owner decision, Session 2).
  const wasCollapsed = s.collapsed;
  let collapsedNow = false;
  if (!s.collapsed && T < s.tau) {
    s.collapsed = true;
    s.collapseRound = round;
    collapsedNow = true;
    T = Math.max(0, T - p.BACKLASH);
    for (const f of s.firms) if (f.cash > 0) f.cash *= p.COLLAPSE_CASH_HAIRCUT;
  }
  s.T = T;

  // 8. Market.
  const M = p.M_PER_FIRM * N * Math.pow(T / p.TRUST_MAX, p.GAMMA) * (s.collapsed ? p.MORATORIUM_M : 1);
  s.M = M;

  // 9. Share.
  const weight = s.firms.map((f, i) => Math.pow(f.cap * shareMultiplier(at(i).card, p), p.ALPHA));
  const totalWeight = weight.reduce((x, y) => x + y, 0);
  const share = weight.map((w) => (totalWeight > 0 ? w / totalWeight : 1 / N));

  // 10. P&L.
  const revenue = share.map((sh, i) => sh * M * (incident[i] ? 1 - p.INC_REV_LOSS : 1));
  const cost = applied.map((a) => byPace(p.COMPUTE_COST, a.pace) + a.safety * p.BUDGET_REF + cardCost(a.card, p));
  const profit = revenue.map((r, i) => r - (cost[i] ?? 0));
  const cashBeforeFines = s.firms.map((f, i) => {
    f.cash += profit[i] ?? 0;
    return f.cash;
  });

  // 11. Pacts: compliance, audits and sanctions, dissolution.
  const appliedById = new Map(s.firms.map((f, i) => [f.id, { pace: at(i).pace, safety: at(i).safety }]));
  recordViolations(s.pacts, s.pactsPrivate, appliedById, round);
  const cardById = new Map(s.firms.map((f, i) => [f.id, at(i).card]));
  const audits = runAudits(
    s.pacts,
    s.pactsPrivate,
    s.firms,
    cardById,
    s.pendingAudits,
    s.autoAuditP,
    round,
    streamRng(s.seed, round, 'audit'),
    p,
  );
  dissolvePacts(s.pacts, round, p);
  s.pendingAudits = [];

  // 12. Insolvency (sticky).
  const newlyInsolvent: string[] = [];
  for (const f of s.firms) {
    if (!f.insolvent && f.cash < p.INSOLVENCY) {
      f.insolvent = true;
      newlyInsolvent.push(f.id);
    }
  }

  // 13. Valuation.
  const capFactor = (T / p.TRUST_MAX) * (s.collapsed ? p.COLLAPSE_CAP_WRITEDOWN : 1);
  for (const f of s.firms) {
    f.valuation = f.cash + p.CAP_MULT * f.cap * capFactor;
    f.peakValuation = Math.max(f.peakValuation, f.valuation);
  }

  // 14. Rank: valuation desc, then cash desc, then creation order.
  const prevRank = new Map(s.firms.map((f) => [f.id, f.rank]));
  const ranked = [...s.firms].sort((a, b) => b.valuation - a.valuation || b.cash - a.cash || a.order - b.order);
  ranked.forEach((f, i) => {
    f.rank = i + 1;
  });
  const rankDelta = (f: FirmState): number => (round === 1 ? 0 : (prevRank.get(f.id) ?? f.rank) - f.rank);
  let overtake: { firm: string; firm2: string } | null = null;
  let best = 0;
  for (const f of s.firms) {
    const delta = rankDelta(f);
    if (delta > best) {
      const passed = s.firms.find((g) => prevRank.get(g.id) === f.rank);
      if (passed) {
        best = delta;
        overtake = { firm: f.id, firm2: passed.id };
      }
    }
  }

  // Firm bookkeeping for the next quarter.
  s.firms.forEach((f, i) => {
    const a = at(i);
    f.lastCard = a.card;
    if (a.card === 'POACH') f.lastPoachTarget = a.target;
    f.lastPace = a.pace;
    f.lastSafety = a.safety;
  });

  // 15. Headlines.
  const finalRound = isFinalRound(s, round, p);
  const bandAfter = trustBand(T, p);
  const headlines = roundHeadlines(
    {
      round,
      disclosure: s.disclosure,
      collapsedNow,
      moratorium: wasCollapsed,
      finalRound,
      tickers: new Map(s.firms.map((f) => [f.id, f.ticker])),
      order: s.firms.map((f) => f.id),
      incidents: s.firms.filter((_, i) => incident[i]).map((f) => f.id),
      cards: s.firms.map((f, i) => ({ firmId: f.id, card: at(i).card, target: at(i).target })),
      pace4: s.firms.filter((_, i) => at(i).pace === 4).map((f) => f.id),
      newlyInsolvent,
      audits,
      pactNames: new Map(s.pacts.map((pc) => [pc.id, pc.name])),
      overtake,
      bandBefore: s.trustBand,
      bandAfter,
    },
    streamRng(s.seed, round, 'headline'),
    p,
  );
  s.trustBand = bandAfter;

  // 16. Outputs.
  const firmResults: Record<string, FirmRoundResult> = {};
  s.firms.forEach((f, i) => {
    const a = at(i);
    firmResults[f.id] = {
      pace: a.pace,
      safety: a.safety,
      card: a.card,
      target: a.target,
      auto: a.auto,
      expo: expo[i] ?? 0,
      draw: draw[i] ?? 0,
      incident: incident[i] ?? false,
      share: share[i] ?? 0,
      revenue: revenue[i] ?? 0,
      cost: cost[i] ?? 0,
      fine: (cashBeforeFines[i] ?? f.cash) - f.cash,
      profit: profit[i] ?? 0,
      cash: f.cash,
      cap: f.cap,
      valuation: f.valuation,
      rank: f.rank,
      rankDelta: rankDelta(f),
      insolvent: f.insolvent,
    };
  });
  const disclosure = s.disclosure
    ? disclosureSnapshot(s.firms, new Map(s.firms.map((f, i) => [f.id, { pace: at(i).pace, safety: at(i).safety, expo: expo[i] ?? 0 }])))
    : null;

  const record: RoundRecord = {
    round,
    T,
    dT: T - T0,
    M,
    collapsed: s.collapsed,
    incidents: incidentCount,
    headlines,
    audits,
    disclosure,
    firms: firmResults,
    incidentDraws,
  };
  s.history.push(record);
  s.round = round;

  const outputs: RoundOutputs = { ...record, collapsedNow, notices, finalRound };
  const g = { label: s.label, round, T, M, collapsed: s.collapsed };
  const dataLines = s.firms.map((f) => dataLine(g, f, firmResults[f.id] as FirmRoundResult));
  return { state: s, outputs, dataLines };
}
