import { describe, expect, it } from 'vitest';
import { findViolations, MORATORIUM_HEADLINE as LINT_MORATORIUM } from '../../scripts/lib/copy-rules';
import {
  BANK,
  disclosureHeadline,
  fill,
  MORATORIUM_HEADLINE,
  PARAMS,
  pactFormedHeadline,
  pactJoinedHeadline,
  pactLeftHeadline,
  resolveRound,
  trustBand,
} from '../../src/engine';
import { all, dec, game } from './helpers';

const templates = Object.values(BANK).flat();

describe('headline bank', () => {
  it('holds at least 40 templates', () => {
    expect(templates.length).toBeGreaterThanOrEqual(40);
  });

  it('passes the copy rules; only the moratorium headline says collapse', () => {
    expect(MORATORIUM_HEADLINE).toBe(LINT_MORATORIUM);
    for (const t of templates) {
      expect(findViolations(t, { allowNonTelegraphing: false }), t).toEqual([]);
      expect(t).not.toMatch(/!/);
    }
    expect(templates.filter((t) => /collapse/i.test(t))).toEqual([MORATORIUM_HEADLINE]);
  });

  it('contains every §15.4 headline verbatim', () => {
    for (const t of [
      'Halden poll: public broadly optimistic on AI products',
      'Consumer groups question pace of model releases',
      'Halden poll: majority now uneasy about frontier AI',
      'Assembly members table AI licensing bill',
      'OFS signals review of emergency powers',
      "OFS chair: 'all options on the table'",
      '{FIRM} overtakes {FIRM2} on valuation',
      '{FIRM} accelerates release schedule',
      'Unnamed lab accelerates release schedule, sources say',
      'Service outage traced to {FIRM} model',
      '{FIRM} model linked to fraud wave',
      'Data leak hits {FIRM} enterprise clients',
      '{FIRM} publishes evaluation results',
      '{FIRM} expands policy team in capital',
      '{FIRM} hires senior researchers from {TARGET}',
      '{FIRM} launches global ad campaign',
      '{FIRMS} sign voluntary release accord {PACT}',
      '{FIRM} joins {PACT}',
      '{FIRM} withdraws from {PACT}',
      'Audit of {PACT} finds full compliance',
      'Audit finds {FIRM} breached {PACT} terms; fine levied',
      'Assembly passes frontier disclosure rule',
      'Disclosure rule suspended',
      '{FIRM} enters administration talks',
      MORATORIUM_HEADLINE,
      'Moratorium extended; sector valuations slide',
      'Markets close for the period',
    ]) {
      expect(templates).toContain(t);
    }
  });

  it('names no real companies (spot check)', () => {
    for (const t of templates) expect(t).not.toMatch(/OpenAI|Google|Anthropic|Meta|Microsoft|DeepMind|Nvidia/i);
  });
});

describe('template engine', () => {
  it('fills placeholders', () => {
    expect(fill('{FIRM} hires senior researchers from {TARGET}', { FIRM: 'ARCN', TARGET: 'BRLK' })).toBe('ARCN hires senior researchers from BRLK');
    expect(pactFormedHeadline(['ARCN', 'BRLK', 'CYRA'], 'PACT-A', 0).text).toBe('ARCN, BRLK and CYRA sign voluntary release accord PACT-A');
    expect(pactJoinedHeadline('DOLM', 'PACT-B', 0).text).toBe('DOLM joins PACT-B');
    expect(pactLeftHeadline('DOLM', 'PACT-B', 0).text).toBe('DOLM withdraws from PACT-B');
    expect(disclosureHeadline(true).text).toBe('Assembly passes frontier disclosure rule');
    expect(disclosureHeadline(false).text).toBe('Disclosure rule suspended');
  });

  it('maps trust to bands', () => {
    expect([95, 80, 79.9, 70, 65, 55, 45, 39.9, 0].map((T) => trustBand(T, PARAMS))).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 5]);
  });

  it('never names a pace-4 firm while disclosure is off', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = game(3, { seed });
      const r = resolveRound(g, all(g, dec(4, 0)));
      for (const h of r.outputs.headlines.filter((x) => x.kind === 'pace4')) expect(h.text).toMatch(/^Unnamed lab/);
      const d = game(3, { seed, settings: { disclosure: true } });
      const rd = resolveRound(d, all(d, dec(4, 0)));
      for (const h of rd.outputs.headlines.filter((x) => x.kind === 'pace4')) expect(h.text).not.toMatch(/^Unnamed lab/);
    }
  });

  it('includes card headlines', () => {
    const g = game(4, { settings: { disclosure: false } });
    const r = resolveRound(g, { f0: dec(1, 30, 'PUBLISH') }, { ...PARAMS, INC_BASE: [0, 0, 0, 0] });
    expect(r.outputs.headlines.some((h) => h.kind === 'publish' && h.text.includes('ARCN'))).toBe(true);
  });
});
