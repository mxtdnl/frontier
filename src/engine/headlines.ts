/**
 * Wire headline template engine (spec §6.3 step 15, §15.4).
 * Fictional entities only: Office of Frontier Systems (OFS), the Assembly, Halden Research.
 * Every template must pass the copy rules; only the moratorium headline may say "collapse".
 */
import type { Params } from './params';
import type { Rng } from './rng';
import type { AuditResult, Card, Headline, HeadlineKind } from './types';

export const MORATORIUM_HEADLINE = 'OFS imposes moratorium on frontier deployments; markets collapse';

export type TemplateKey =
  | Exclude<HeadlineKind, 'trust-band' | 'breach' | 'pace4'>
  | 'band0'
  | 'band1'
  | 'band2'
  | 'band3'
  | 'band4'
  | 'band5'
  | 'breach'
  | 'breach-waived'
  | 'breach-expelled'
  | 'pace4-named'
  | 'pace4-anon';

/** Placeholders: {FIRM}, {FIRM2}, {TARGET}, {PACT}, {FIRMS}. */
export const BANK: Readonly<Record<TemplateKey, ReadonlyArray<string>>> = {
  band0: ['Halden poll: public broadly optimistic on AI products', 'Halden Research: consumer confidence in AI tools holds firm'],
  band1: ['Consumer groups question pace of model releases', 'Halden poll: optimism on AI products edges lower'],
  band2: ['Halden poll: majority now uneasy about frontier AI', 'Editorials call for slower model rollouts'],
  band3: ['Assembly members table AI licensing bill', 'Halden poll: support for AI licensing reaches majority'],
  band4: ['OFS signals review of emergency powers', 'Assembly fast-tracks hearings on frontier deployments'],
  band5: ["OFS chair: 'all options on the table'", 'Halden poll: confidence in AI sector at record low'],
  collapse: [MORATORIUM_HEADLINE],
  moratorium: ['Moratorium extended; sector valuations slide', 'OFS keeps deployment freeze in place; investors retreat'],
  final: ['Markets close for the period'],
  breach: ['Audit finds {FIRM} breached {PACT} terms; fine levied', '{FIRM} sanctioned after {PACT} audit'],
  'breach-waived': ['Audit finds {FIRM} breached {PACT} terms; fine waived'],
  'breach-expelled': ['{FIRM} expelled from {PACT} after repeated breaches'],
  'audit-clean': ['Audit of {PACT} finds full compliance', '{PACT} members pass independent audit'],
  insolvency: ['{FIRM} enters administration talks', '{FIRM} misses debt payment; creditors convene'],
  incident: [
    'Service outage traced to {FIRM} model',
    '{FIRM} model linked to fraud wave',
    'Data leak hits {FIRM} enterprise clients',
    '{FIRM} pulls model update after misuse reports',
    'Hospital network suspends {FIRM} assistant after errors',
  ],
  rank: ['{FIRM} overtakes {FIRM2} on valuation', '{FIRM} passes {FIRM2} in market value'],
  publish: ['{FIRM} publishes evaluation results', '{FIRM} releases red-team findings'],
  lobby: ['{FIRM} expands policy team in capital', '{FIRM} hosts Assembly members at research campus'],
  poach: ['{FIRM} hires senior researchers from {TARGET}', '{TARGET} loses research leads to {FIRM}'],
  blitz: ['{FIRM} launches global ad campaign', '{FIRM} books prime-time slots for product launch'],
  'pace4-named': ['{FIRM} accelerates release schedule', '{FIRM} brings forward next model launch'],
  'pace4-anon': ['Unnamed lab accelerates release schedule, sources say', 'Unnamed lab brings forward model launch, sources say'],
  ambient: [
    'OFS publishes quarterly sector bulletin',
    'Halden Research: enterprise AI spending steady',
    'Chip supply tight as labs expand data centres',
    'Assembly committee hears testimony on model evaluations',
    'Analysts revise frontier sector forecasts',
    'Insurers review cover for AI-related losses',
  ],
  'pact-formed': ['{FIRMS} sign voluntary release accord {PACT}', '{FIRMS} announce joint release limits under {PACT}'],
  'pact-joined': ['{FIRM} joins {PACT}', '{FIRM} signs on to {PACT}'],
  'pact-left': ['{FIRM} withdraws from {PACT}', '{FIRM} exits {PACT} terms'],
  'disclosure-on': ['Assembly passes frontier disclosure rule'],
  'disclosure-off': ['Disclosure rule suspended'],
};

export type Vars = Partial<Record<'FIRM' | 'FIRM2' | 'TARGET' | 'PACT' | 'FIRMS', string>>;

export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(FIRM2|FIRMS|FIRM|TARGET|PACT)\}/g, (_, k: keyof Vars) => vars[k] ?? '');
}

const KIND_OF: Record<TemplateKey, HeadlineKind> = {
  band0: 'trust-band', band1: 'trust-band', band2: 'trust-band', band3: 'trust-band', band4: 'trust-band', band5: 'trust-band',
  collapse: 'collapse', moratorium: 'moratorium', final: 'final',
  breach: 'breach', 'breach-waived': 'breach', 'breach-expelled': 'breach', 'audit-clean': 'audit-clean',
  insolvency: 'insolvency', incident: 'incident', rank: 'rank',
  publish: 'publish', lobby: 'lobby', poach: 'poach', blitz: 'blitz',
  'pace4-named': 'pace4', 'pace4-anon': 'pace4', ambient: 'ambient',
  'pact-formed': 'pact-formed', 'pact-joined': 'pact-joined', 'pact-left': 'pact-left',
  'disclosure-on': 'disclosure-on', 'disclosure-off': 'disclosure-off',
};

/** One headline from the bank. `u` in [0, 1) selects the template. */
export function headline(key: TemplateKey, vars: Vars, u: number): Headline {
  const list = BANK[key];
  const t = list[Math.min(list.length - 1, Math.floor(u * list.length))] ?? '';
  return { kind: KIND_OF[key], text: fill(t, vars) };
}

/** Headlines for live events outside resolution (pact changes, disclosure toggle). */
export function pactFormedHeadline(tickers: ReadonlyArray<string>, pact: string, u: number): Headline {
  return headline('pact-formed', { FIRMS: joinTickers(tickers), PACT: pact }, u);
}
export function pactJoinedHeadline(ticker: string, pact: string, u: number): Headline {
  return headline('pact-joined', { FIRM: ticker, PACT: pact }, u);
}
export function pactLeftHeadline(ticker: string, pact: string, u: number): Headline {
  return headline('pact-left', { FIRM: ticker, PACT: pact }, u);
}
export function disclosureHeadline(on: boolean): Headline {
  return headline(on ? 'disclosure-on' : 'disclosure-off', {}, 0);
}

function joinTickers(t: ReadonlyArray<string>): string {
  if (t.length <= 1) return t[0] ?? '';
  return `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
}

/** Band index: 0 for T ≥ 80 … 5 for T < 40. */
export function trustBand(T: number, p: Params): number {
  const i = p.TRUST_BANDS.findIndex((lo) => T >= lo);
  return i === -1 ? p.TRUST_BANDS.length : i;
}

export interface HeadlineContext {
  round: number;
  disclosure: boolean;
  collapsedNow: boolean;
  /** Collapsed in an earlier round. */
  moratorium: boolean;
  finalRound: boolean;
  /** Firm tickers by id. */
  tickers: ReadonlyMap<string, string>;
  /** Firm ids in creation order. */
  order: ReadonlyArray<string>;
  incidents: ReadonlyArray<string>;
  cards: ReadonlyArray<{ firmId: string; card: Card; target: string | null }>;
  pace4: ReadonlyArray<string>;
  newlyInsolvent: ReadonlyArray<string>;
  audits: ReadonlyArray<AuditResult>;
  pactNames: ReadonlyMap<string, string>;
  overtake: { firm: string; firm2: string } | null;
  bandBefore: number;
  bandAfter: number;
}

const CARD_KEY: Partial<Record<Card, TemplateKey>> = { POACH: 'poach', PUBLISH: 'publish', LOBBY: 'lobby', BLITZ: 'blitz' };

/**
 * 2–4 headlines for a resolved quarter. Candidates are ranked: moratorium start,
 * moratorium continuing, final round, audit breaches, clean audits, insolvency,
 * incidents, rank change, cards, pace 4, trust band, then general news as filler.
 */
export function roundHeadlines(ctx: HeadlineContext, rng: Rng, p: Params): Headline[] {
  const tk = (id: string): string => ctx.tickers.get(id) ?? id;
  const out: Headline[] = [];
  const add = (key: TemplateKey, vars: Vars = {}): void => {
    out.push(headline(key, vars, rng()));
  };

  if (ctx.collapsedNow) add('collapse');
  if (ctx.moratorium) add('moratorium');
  if (ctx.finalRound) add('final');
  for (const a of ctx.audits) {
    const PACT = ctx.pactNames.get(a.pactId) ?? a.pactId;
    if (a.breaches.length === 0) add('audit-clean', { PACT });
    for (const b of a.breaches) {
      const key: TemplateKey = b.expelled ? 'breach-expelled' : b.waived ? 'breach-waived' : 'breach';
      add(key, { FIRM: tk(b.firmId), PACT });
    }
  }
  for (const id of ctx.newlyInsolvent) add('insolvency', { FIRM: tk(id) });
  for (const id of ctx.incidents) add('incident', { FIRM: tk(id) });
  if (ctx.overtake) add('rank', { FIRM: tk(ctx.overtake.firm), FIRM2: tk(ctx.overtake.firm2) });
  for (const c of ctx.cards) {
    const key = CARD_KEY[c.card];
    if (key) add(key, { FIRM: tk(c.firmId), TARGET: c.target ? tk(c.target) : '' });
  }
  if (ctx.pace4.length > 0) {
    if (ctx.disclosure) {
      const id = ctx.pace4[Math.floor(rng() * ctx.pace4.length)] ?? '';
      add('pace4-named', { FIRM: tk(id) });
    } else {
      add('pace4-anon');
    }
  }
  const bandRoll = rng();
  if (ctx.bandAfter !== ctx.bandBefore || bandRoll < p.TRUST_BAND_P) add(`band${ctx.bandAfter}` as TemplateKey);

  const chosen = out.slice(0, p.HEADLINES_MAX);
  const used = new Set(chosen.map((h) => h.text));
  const ambient = BANK.ambient;
  let guard = 0;
  while (chosen.length < p.HEADLINES_MIN && guard++ < ambient.length * 4) {
    const h = headline('ambient', {}, rng());
    if (!used.has(h.text)) {
      used.add(h.text);
      chosen.push(h);
    }
  }
  return chosen;
}
