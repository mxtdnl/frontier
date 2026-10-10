/**
 * Engine types (spec §6, §9, §12). Every value is plain JSON: `null`, never `undefined`,
 * so the Firebase layer can store state without conversion of missing fields.
 */

export type Pace = 1 | 2 | 3 | 4;
export type Card = 'NONE' | 'POACH' | 'PUBLISH' | 'LOBBY' | 'BLITZ' | 'SHARE' | 'RUSH';
export const CARDS: ReadonlyArray<Card> = ['NONE', 'POACH', 'PUBLISH', 'LOBBY', 'BLITZ', 'SHARE', 'RUSH'];

/** Policies the facilitator can assign to bot firms (spec §5.4, §7). */
export type BotPolicy = 'cautious' | 'standard' | 'greedy' | 'mimic-leader';
/**
 * Engine-internal policies. `sustainable` drives the counterfactual (§10) and the
 * calibration scenarios (§8.1). It is never offered in the UI.
 */
export type Policy = BotPolicy | 'sustainable';

export type EndMode = 'manual' | 'random' | 'fixed';
export type ExposureLabel = 'LOW' | 'MED' | 'HIGH' | 'SEVERE';

export interface GameSettings {
  /** Join code. Used as `game=` in DATA lines. */
  label: string;
  endMode: EndMode;
  /** Range for `random` end mode. */
  minEnd: number;
  maxEnd: number;
  /** Explicit end round for `fixed` end mode; null otherwise. */
  fixedEnd: number | null;
  /** Disclosure state at the start (§5.4). */
  disclosure: boolean;
  /** Automatic audit probability per pact per quarter (§9.2). */
  autoAuditP: number;
}

export interface FirmInit {
  id: string;
  ticker: string;
  isBot: boolean;
  botPolicy: Policy | null;
}

export interface Decision {
  pace: Pace;
  /** Integer 0 to 30. */
  safety: number;
  card: Card;
  /** POACH target firm id; null otherwise. */
  target: string | null;
}

export interface FirmState {
  id: string;
  ticker: string;
  /** Creation order, 0-based. Indexes incident draws (§6.8). */
  order: number;
  isBot: boolean;
  botPolicy: Policy | null;
  cash: number;
  cap: number;
  /** Card applied last quarter (NONE if none). */
  lastCard: Card;
  /** Target of the firm's most recent POACH. */
  lastPoachTarget: string | null;
  /** Pace and safety applied last quarter; used for defaults (§6.4). */
  lastPace: Pace;
  lastSafety: number;
  /** Σ d_i × 8/N over all quarters. */
  cumulativeDraw: number;
  incidents: number;
  insolvent: boolean;
  valuation: number;
  peakValuation: number;
  rank: number;
  /** Last round on which the board shows BREACH; 0 if never. */
  breachUntilRound: number;
}

export interface PactTerms {
  maxPace: Pace | null;
  minSafety: number | null;
}

/** Public pact record (§9.1, `pacts/{pactId}`). */
export interface Pact {
  id: string;
  name: string;
  proposer: string;
  terms: PactTerms;
  /** firmId → round joined. */
  members: Record<string, number>;
  createdRound: number;
  status: 'active' | 'dissolved';
}

/** Private pact record (`pactsPrivate/{pactId}`). Facilitator only. */
export interface PactPrivate {
  /** round → firmId → true. Every recorded breach. */
  violations: Record<string, Record<string, true>>;
  /** round → firmId → true. Breaches published by an audit. */
  detected: Record<string, Record<string, true>>;
  /**
   * round → firmId → true. Every member checked against the terms that round (§9.2), breach or not.
   * Records written before 2026-10-05 have none; results then show breaches only.
   */
  checked: Record<string, Record<string, true>>;
  /** firmId → number of detected violations (one per audit that found the firm). */
  sanctions: Record<string, number>;
  /** 0 if never audited. */
  lastAuditRound: number;
}

export interface DisclosureEntry {
  pace: Pace;
  safety: number;
  /** d_i for the round. */
  expo: number;
  /**
   * The firm's incident probability q_i this quarter (§6.3 step 5, cards included), stored only for a firm that had
   * an incident (Session 18, owner decision 2026-10-10); null otherwise. Feeds the projector's incident cause line.
   */
  risk: number | null;
}

export type HeadlineKind =
  | 'collapse'
  | 'moratorium'
  | 'final'
  | 'breach'
  | 'audit-clean'
  | 'insolvency'
  | 'incident'
  | 'rank'
  | 'publish'
  | 'lobby'
  | 'poach'
  | 'blitz'
  | 'share'
  | 'rush'
  | 'pace4'
  | 'trust-band'
  | 'ambient'
  | 'pact-formed'
  | 'pact-joined'
  | 'pact-left'
  | 'disclosure-on'
  | 'disclosure-off';

export interface Headline {
  kind: HeadlineKind;
  text: string;
}

export interface AuditBreach {
  firmId: string;
  /** Rounds in the audit window in which the firm breached. */
  rounds: number[];
  /** Detected violation count for this firm in this pact, after this audit. */
  count: number;
  fine: number;
  waived: boolean;
  expelled: boolean;
}

export interface AuditResult {
  pactId: string;
  kind: 'manual' | 'auto';
  /** Rounds examined. */
  rounds: number[];
  breaches: AuditBreach[];
}

export type NoticeKind = 'card-insolvent' | 'card-cooldown' | 'card-target' | 'card-target-repeat';

/** Private per-firm notice (§6.3 step 2). */
export interface Notice {
  firmId: string;
  kind: NoticeKind;
  card: Card;
}

/** Per-firm outcome of one quarter. Contains private fields; the orchestrator splits them. */
export interface FirmRoundResult {
  pace: Pace;
  safety: number;
  /** Card applied after validation. */
  card: Card;
  target: string | null;
  auto: boolean;
  /** d_i (exposure). */
  expo: number;
  /** d_i × 8/N: this firm's trust draw this quarter. */
  draw: number;
  incident: boolean;
  share: number;
  revenue: number;
  cost: number;
  fine: number;
  profit: number;
  cash: number;
  cap: number;
  valuation: number;
  rank: number;
  /** Previous rank minus new rank: positive means the firm moved up. */
  rankDelta: number;
  insolvent: boolean;
}

export interface RoundRecord {
  round: number;
  T: number;
  dT: number;
  M: number;
  collapsed: boolean;
  incidents: number;
  headlines: Headline[];
  audits: AuditResult[];
  /** Published snapshot when disclosure was on; otherwise null. */
  disclosure: Record<string, DisclosureEntry> | null;
  firms: Record<string, FirmRoundResult>;
  /** Incident draws u_{t,i} by firm creation order. */
  incidentDraws: number[];
  /** Firms that had an incident this quarter, in creation order (§12, Session 18). */
  incidentFirms: string[];
}

export interface EngineState {
  seed: number;
  label: string;
  /** Last resolved round; 0 before round 1. */
  round: number;
  T: number;
  M: number;
  collapsed: boolean;
  collapseRound: number | null;
  /** Hidden (facilitator only). */
  tau: number;
  endMode: EndMode;
  /** Hidden (facilitator only). Null in manual mode. */
  endRound: number | null;
  disclosure: boolean;
  autoAuditP: number;
  /** In creation order. */
  firms: FirmState[];
  /** In creation order. */
  pacts: Pact[];
  pactsPrivate: Record<string, PactPrivate>;
  /** Pact ids the facilitator asked to audit; run at the next resolution (§9.2). */
  pendingAudits: string[];
  history: RoundRecord[];
  /** Trust band index after the last resolution (see headlines.ts). */
  trustBand: number;
}

export interface RoundOutputs {
  round: number;
  T: number;
  dT: number;
  M: number;
  collapsed: boolean;
  /** True only in the round the moratorium began. */
  collapsedNow: boolean;
  incidents: number;
  headlines: Headline[];
  audits: AuditResult[];
  disclosure: Record<string, DisclosureEntry> | null;
  firms: Record<string, FirmRoundResult>;
  notices: Notice[];
  incidentDraws: number[];
  incidentFirms: string[];
  /** True when this round is the hidden end round or the hard maximum. */
  finalRound: boolean;
}

export interface ResolveResult {
  state: EngineState;
  outputs: RoundOutputs;
  dataLines: string[];
}
