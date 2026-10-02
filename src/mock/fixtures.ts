/**
 * Static fixtures for Session 1. Every number here is illustrative and exists only
 * to drive the static screens. None of it is engine output or a tunable parameter.
 */

export type MockTag = 'BOT' | 'AUTO' | 'INSOLV';

export interface MockFirm {
  ticker: string;
  name: string;
  share: number;
  /** Change in share, percentage points. */
  dShare: number;
  profit: number;
  value: number;
  /** Change in valuation versus the previous quarter. */
  dValue: number;
  committed: boolean;
  tags: MockTag[];
  pacts: string[];
  breach: boolean;
  members: number;
  // Shown only while disclosure is on.
  pace: number;
  safety: number;
  expo: number;
}

/** Ordered by valuation, highest first. */
export const FIRMS: ReadonlyArray<MockFirm> = [
  { ticker: 'ARCN', name: 'Arcturn Labs', share: 0.214, dShare: 2.4, profit: 38.4, value: 412.6, dValue: 41.0, committed: true, tags: [], pacts: [], breach: false, members: 4, pace: 4, safety: 3, expo: 6.8 },
  { ticker: 'BRLK', name: 'Brelek Models', share: 0.176, dShare: 0.3, profit: 31.0, value: 377.9, dValue: 2.0, committed: true, tags: ['BOT'], pacts: ['PACT-A'], breach: true, members: 3, pace: 3, safety: 8, expo: 4.1 },
  { ticker: 'CYRA', name: 'Cyra Systems', share: 0.151, dShare: -0.9, profit: 24.6, value: 351.2, dValue: -4.4, committed: true, tags: [], pacts: ['PACT-A'], breach: false, members: 5, pace: 3, safety: 12, expo: 3.6 },
  { ticker: 'DOLM', name: 'Dolmen AI', share: 0.139, dShare: 0.5, profit: 22.9, value: 329.5, dValue: 6.1, committed: true, tags: [], pacts: ['PACT-A'], breach: false, members: 3, pace: 2, safety: 15, expo: 1.9 },
  { ticker: 'EMBR', name: 'Ember Compute', share: 0.121, dShare: -1.1, profit: 18.3, value: 301.0, dValue: -12.7, committed: false, tags: [], pacts: [], breach: false, members: 4, pace: 4, safety: 2, expo: 6.4 },
  { ticker: 'FJRD', name: 'Fjordline', share: 0.093, dShare: 0.2, profit: 11.2, value: 266.3, dValue: 1.5, committed: true, tags: ['BOT'], pacts: ['PACT-A', 'PACT-B'], breach: false, members: 2, pace: 2, safety: 18, expo: 1.2 },
  { ticker: 'GLYN', name: 'Glynn Research', share: 0.068, dShare: -0.8, profit: 3.9, value: 214.8, dValue: -8.9, committed: false, tags: ['AUTO'], pacts: [], breach: false, members: 3, pace: 3, safety: 6, expo: 3.8 },
  { ticker: 'HRTH', name: 'Hearth Systems', share: 0.038, dShare: -0.6, profit: -6.5, value: 98.4, dValue: -20.1, committed: true, tags: ['INSOLV'], pacts: ['PACT-B'], breach: false, members: 2, pace: 1, safety: 4, expo: 0.9 },
];

export const OWN_TICKER = 'DOLM';
export const ROUND = 7;
export const COMMITTED = FIRMS.filter((f) => f.committed).length;

/** Valuation before this quarter's resolution. */
export function prevValue(f: MockFirm): number {
  return f.value - f.dValue;
}
export function prevShare(f: MockFirm): number {
  return f.share - f.dShare / 100;
}
export function prevRank(f: MockFirm): number {
  return [...FIRMS].sort((a, b) => prevValue(b) - prevValue(a)).findIndex((x) => x.ticker === f.ticker);
}

export const TRUST_HISTORY: ReadonlyArray<number> = [90.0, 89.2, 86.4, 82.7, 77.8, 68.1, 61.8];
export const TRUST = {
  value: 61.8,
  prev: 68.1,
  marketSize: 1184,
  marketRef: 1500,
  incidents: 3,
};

export interface MockPact {
  id: string;
  maxPace: number | null;
  minSafety: number | null;
  members: string[];
  /** Private to the control console. */
  unaudited: number;
}
export const PACTS: ReadonlyArray<MockPact> = [
  { id: 'PACT-A', maxPace: 3, minSafety: 10, members: ['BRLK', 'CYRA', 'DOLM', 'FJRD'], unaudited: 1 },
  { id: 'PACT-B', maxPace: 2, minSafety: null, members: ['FJRD', 'HRTH'], unaudited: 0 },
];

export interface MockHeadline {
  round: number;
  text: string;
}
export const HEADLINES: ReadonlyArray<MockHeadline> = [
  { round: 7, text: 'ARCN overtakes BRLK on valuation' },
  { round: 7, text: 'Halden poll: majority now uneasy about frontier AI' },
  { round: 7, text: 'Audit finds BRLK breached PACT-A terms; fine levied' },
  { round: 7, text: 'Service outage traced to EMBR model' },
  { round: 7, text: 'HRTH enters administration talks' },
  { round: 6, text: 'Unnamed lab accelerates release schedule, sources say' },
  { round: 6, text: 'DOLM publishes evaluation results' },
  { round: 6, text: 'FJRD joins PACT-B' },
  { round: 5, text: 'Consumer groups question pace of model releases' },
  { round: 5, text: 'Data leak hits CYRA enterprise clients' },
  { round: 4, text: 'FJRD, HRTH sign voluntary release accord PACT-B' },
  { round: 3, text: 'EMBR launches global ad campaign' },
];

/** Moratorium headline: the single permitted use of the restricted term (spec §15.3). */
export const MORATORIUM_HEADLINE = 'OFS imposes moratorium on frontier deployments; markets collapse';

export const BRIEFING_LINES = {
  market: [
    'Total market revenue tracks public trust.',
    'Trust recovers when pressure eases.',
    'Pace builds capability faster. Capability earns market share.',
    'Safety spend costs money. It lowers public exposure and incident risk.',
    'Valuation reflects cash plus capability, priced by the market.',
  ],
  controls: [
    ['PACE', 'Cautious, Standard, Aggressive or Breakneck.'],
    ['SAFETY', 'Spend as a share of the reference budget.'],
    ['CARD', 'One optional action. The same card cannot repeat in consecutive quarters.'],
  ],
  cards: [
    ['POACH', 'Take capability from a named rival.'],
    ['PUBLISH', 'Release safety research.'],
    ['LOBBY', 'Press regulators on fines.'],
    ['BLITZ', 'Run a marketing push.'],
  ],
  commits: [
    'Commit once per quarter. Change and recommit until the timer closes.',
    'Firms that do not commit keep last quarter’s settings and show AUTO.',
    'The timer is shown on every screen.',
  ],
} as const;

// ---------- Participant (own firm DOLM) ----------

export const PACE_OPTIONS = [
  { value: 1, label: '1', sub: 'Cautious' },
  { value: 2, label: '2', sub: 'Standard' },
  { value: 3, label: '3', sub: 'Aggressive' },
  { value: 4, label: '4', sub: 'Breakneck' },
] as const;

/** Card costs from spec §5.2. Mock copy of tunable values; the engine owns the real ones from Session 2. */
export const CARDS = [
  { id: 'NONE', name: 'No card', cost: 0, effect: 'Play nothing this quarter.' },
  { id: 'POACH', name: 'Poach talent', cost: 15, effect: 'Gain capability from a target firm. Needs a target.' },
  { id: 'PUBLISH', name: 'Publish safety research', cost: 10, effect: 'Raises public trust. Lowers your incident risk this quarter.' },
  { id: 'LOBBY', name: 'Lobby regulators', cost: 10, effect: 'Exempt from pact fines this quarter. Lowers public trust.' },
  { id: 'BLITZ', name: 'Marketing blitz', cost: 15, effect: 'Capability counts for more in share this quarter.' },
] as const;

/** Illustrative compute cost per pace for the estimate line. Not an engine value. */
const MOCK_COMPUTE_COST = [0, 6, 10, 15, 22] as const;
export function mockEstimatedCost(pace: number, safety: number, card: string): number {
  const cardCost = CARDS.find((c) => c.id === card)?.cost ?? 0;
  return (MOCK_COMPUTE_COST[pace] ?? 0) + safety * 0.5 + cardCost;
}

/** Exposure label bands from spec §6.5: LOW < 1.5 <= MED < 3.5 <= HIGH < 6 <= SEVERE. */
export function exposureLabel(d: number): 'LOW' | 'MED' | 'HIGH' | 'SEVERE' {
  if (d < 1.5) return 'LOW';
  if (d < 3.5) return 'MED';
  if (d < 6) return 'HIGH';
  return 'SEVERE';
}
/** Illustrative exposure for the DESK preview. Not an engine value. */
export function mockExposure(pace: number, safety: number): number {
  return Math.max(0, pace * 1.7 - safety * 0.1);
}

export const OWN = {
  ticker: 'DOLM',
  name: 'Dolmen AI',
  cash: 184.2,
  lastProfit: 22.9,
  device: 'MN',
  lastCard: 'PUBLISH' as string | null,
  lastTarget: null as string | null,
  insolvent: false,
  pace: 2,
  safety: 15,
};

export interface BookRow {
  round: number;
  revenue: number;
  costs: number;
  profit: number;
  value: number;
  rank: number;
}
export const BOOK: ReadonlyArray<BookRow> = [
  { round: 1, revenue: 41.0, costs: 29.5, profit: 11.5, value: 241.0, rank: 5 },
  { round: 2, revenue: 43.2, costs: 28.1, profit: 15.1, value: 262.4, rank: 4 },
  { round: 3, revenue: 47.9, costs: 30.2, profit: 17.7, value: 284.0, rank: 4 },
  { round: 4, revenue: 49.5, costs: 29.0, profit: 20.5, value: 301.2, rank: 4 },
  { round: 5, revenue: 51.0, costs: 29.8, profit: 21.2, value: 318.9, rank: 4 },
  { round: 6, revenue: 50.2, costs: 28.3, profit: 21.9, value: 323.4, rank: 4 },
  { round: 7, revenue: 52.0, costs: 29.1, profit: 22.9, value: 329.5, rank: 4 },
];

export const OWN_RESULT = {
  revenue: 52.0,
  costs: 29.1,
  profit: 22.9,
  dShare: 0.5,
  value: 329.5,
  rank: 4,
  notices: ['Audit of PACT-A: DOLM compliant.'],
};

// ---------- Control ----------

export interface ControlFirm {
  ticker: string;
  members: ReadonlyArray<{ initials: string; online: boolean }>;
  committedAt: string | null;
  autoForecast: boolean;
  bot: string | null;
}
export const CONTROL_FIRMS: ReadonlyArray<ControlFirm> = [
  { ticker: 'ARCN', members: [{ initials: 'KT', online: true }, { initials: 'RS', online: true }], committedAt: '14:01:38', autoForecast: false, bot: null },
  { ticker: 'BRLK', members: [], committedAt: '14:00:02', autoForecast: false, bot: 'greedy' },
  { ticker: 'CYRA', members: [{ initials: 'LM', online: true }], committedAt: '14:02:09', autoForecast: false, bot: null },
  { ticker: 'DOLM', members: [{ initials: 'MN', online: true }, { initials: 'JP', online: false }], committedAt: '14:02:11', autoForecast: false, bot: null },
  { ticker: 'EMBR', members: [{ initials: 'AB', online: true }], committedAt: null, autoForecast: true, bot: null },
  { ticker: 'FJRD', members: [], committedAt: '14:00:02', autoForecast: false, bot: 'cautious' },
  { ticker: 'GLYN', members: [{ initials: 'TW', online: false }], committedAt: null, autoForecast: true, bot: null },
  { ticker: 'HRTH', members: [{ initials: 'DC', online: true }], committedAt: '14:01:55', autoForecast: false, bot: null },
];
export const HIDDEN = { endRound: 13, tau: 35 };

// ---------- Lobby ----------
export const JOIN_CODE = 'KXMT';

// ---------- Reveal helpers (mock) ----------
export function prevProfit(f: MockFirm): number {
  return f.profit - f.dValue * 0.1;
}

/** Deterministic valuation history for the FIRM view, ending at prev and current value. */
export function valueHistory(f: MockFirm): number[] {
  const seed = f.ticker.charCodeAt(0) + f.ticker.charCodeAt(1);
  const start = f.value * 0.62;
  const prev = prevValue(f);
  const out: number[] = [];
  for (let k = 0; k < 5; k++) {
    const base = start + ((prev - start) * k) / 5;
    out.push(base + Math.sin(k * 1.7 + seed) * f.value * 0.012);
  }
  out.push(prev, f.value);
  return out;
}
