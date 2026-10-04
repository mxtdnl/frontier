import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PARAMS, buildResults, nextPactName, resolveRound, type EngineState, type Pact } from '../../src/engine';
import { fromResults } from '../../src/firebase/schema';
import { fmt, fmtShare, quarterLabel } from '../../src/ui/format';
import { OwnResultsCard } from '../../src/screens/Results/OwnResultsCard';
import { Attribution, Counterfactual, FinalBoard, PactRecord, TrustTrace } from '../../src/screens/Results/Results';
import { attributionRows, counterfactualTrustSeries, finalBoardRows, headlineFigures, pactLines, rankedFirms, trustSeries } from '../../src/screens/Results/model';
import type { FinalResults } from '../../src/engine';
import { storeAndRead } from '../firebase/rtdb';
import { dec, game } from '../engine/helpers';

function play(): EngineState {
  let s = game(5, { seed: 21 });
  const pact: Pact = { id: 'p1', name: nextPactName(s.pacts), proposer: 'f0', terms: { maxPace: 2, minSafety: null }, members: { f0: 1, f1: 1 }, createdRound: 1, status: 'active' };
  s.pacts.push(pact);
  for (let r = 1; r <= 8; r++) {
    if (r === 4) s = { ...s, pendingAudits: ['p1'] };
    s = resolveRound(s, Object.fromEntries(s.firms.map((f, i) => [f.id, i % 2 === 0 ? dec(4, 0) : dec(2, 15)])), PARAMS).state;
  }
  return s;
}

const state = play();
/** What a client reads back from the database. */
const read = (tau: boolean) => fromResults(storeAndRead(buildResults(state, { revealTau: tau }))) as NonNullable<ReturnType<typeof fromResults>>;
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe('results model', () => {
  const r = read(false);

  it('ranks firms by the engine rank', () => {
    expect(rankedFirms(r).map((f) => f.rank)).toEqual(state.firms.map((_, i) => i + 1));
  });

  it('trust series start with the opening value', () => {
    expect(trustSeries(r)).toHaveLength(r.rounds + 1);
    expect(counterfactualTrustSeries(r)).toHaveLength(r.rounds + 1);
    expect(trustSeries(r)[0]).toBe(r.startTrust);
  });

  it('names members and undetected violators by ticker', () => {
    const lines = pactLines(r);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.members).toBe('ARCN BRLK');
    expect(lines[0]?.undetectedBy.every((x) => /^[A-Z]{4} \d+$/.test(x))).toBe(true);
  });
});

/** Results with every firm's valuation shifted by `by` (and the industry totals to match). */
function shifted(r: FinalResults, by: number, alternative?: number): FinalResults {
  const final = Object.fromEntries(Object.entries(r.final).map(([id, f]) => [id, { ...f, valuation: f.valuation + by, peakValuation: Math.max(f.peakValuation, f.valuation + by) }]));
  const actual = Object.values(final).reduce((x, f) => x + f.valuation, 0);
  const cf = alternative ?? r.industry.counterfactual;
  const attribution = r.attribution.map((a) => {
    const pos = Object.values(final).reduce((x, f) => x + Math.max(0, f.valuation), 0);
    const v = final[a.firmId]!.valuation;
    return { ...a, valuation: v, valueShare: pos > 0 ? Math.max(0, v) / pos : 0 };
  });
  return { ...r, final, attribution, industry: { actual, counterfactual: cf, destroyed: cf - actual } };
}

describe('negative totals (spec §10, owner decision 5)', () => {
  const base = read(false);

  it('a positive actual total below the alternative shows VALUE LOST with its share of the alternative', () => {
    const r = shifted(base, 1000 - Math.min(...Object.values(base.final).map((f) => f.valuation)), 1e6);
    const f = headlineFigures(r);
    expect(r.industry.actual).toBeGreaterThan(0);
    expect(f.change.label).toBe('VALUE LOST');
    expect(f.change.glyph).toBe('▼');
    expect(f.change.amount).toBeCloseTo(r.industry.destroyed, 9);
    expect(f.change.sub).toBe(`${Math.round((r.industry.destroyed / 1e6) * 100)}% of the alternative`);
  });

  it('a negative industry total shows no percentage and says the industry finished below zero', () => {
    const r = shifted(base, -10_000);
    expect(r.industry.actual).toBeLessThan(0);
    const f = headlineFigures(r);
    expect(f.change.label).toBe('VALUE LOST');
    expect(f.change.sub).toBe('industry finished below zero');
    expect(f.change.sub).not.toMatch(/%/);
    const out = html(createElement(Counterfactual, { r }));
    expect(out).toContain('industry finished below zero');
    expect(out).toContain(`▼${fmt(r.industry.destroyed, 0)}`);
    expect(out).not.toContain('of the alternative');
  });

  it('an actual total above the alternative is labelled VALUE ADDED with ▲', () => {
    const r = shifted(base, 0, base.industry.actual - 500);
    const f = headlineFigures(r);
    expect(r.industry.destroyed).toBeCloseTo(-500, 6);
    expect(f.change.label).toBe('VALUE ADDED');
    expect(f.change.glyph).toBe('▲');
    expect(f.change.amount).toBeCloseTo(500, 6);
    const out = html(createElement(Counterfactual, { r }));
    expect(out).toContain('VALUE ADDED');
    expect(out).toContain(`▲${fmt(500, 0)}`);
    expect(out).not.toContain('VALUE LOST');
  });

  it('negative final valuations are still drawn on the final board, in red, against a zero line', () => {
    const r = shifted(base, -10_000);
    const rows = finalBoardRows(r);
    expect(rows.every((x) => x.final < 0)).toBe(true);
    const out = html(createElement(FinalBoard, { r }));
    expect(out.match(/data-mark="final"/g)).toHaveLength(rows.length);
    expect(out.match(/class="lc-f-down" data-mark="final"/g)).toHaveLength(rows.length);
    expect(out).toContain('class="lc-zero"');
    expect(out).toContain('FINAL BELOW ZERO');
    for (const x of rows) expect(out).toContain(fmt(x.final));
  });

  it('when no firm finishes above zero, the value side says so instead of 0.0% bars', () => {
    const r = shifted(base, -10_000);
    const { rows, anyPositive } = attributionRows(r);
    expect(anyPositive).toBe(false);
    const out = html(createElement(Attribution, { r }));
    expect(out).toContain('No firm finished with positive value');
    expect(out).not.toContain('data-mark="value"');
    expect(out.match(/data-mark="damage"/g)).toHaveLength(rows.length);
    expect(out).not.toContain('0.0%</text>');
  });

  it('one firm above zero is enough to draw the value side', () => {
    const r = read(false);
    const firstId = Object.keys(r.final)[0]!;
    const final = Object.fromEntries(Object.entries(r.final).map(([id, f]) => [id, { ...f, valuation: id === firstId ? 10 : -50 }]));
    expect(attributionRows({ ...r, final }).anyPositive).toBe(true);
  });
});

describe('results panels', () => {
  it('final board shows every firm with its final value, a peak and a final mark, and the drop from peak', () => {
    const r = read(false);
    const out = html(createElement(FinalBoard, { r }));
    const rows = finalBoardRows(r);
    for (const x of rows) {
      expect(out).toContain(`>${x.ticker}<`);
      expect(out).toContain(fmt(x.final));
      expect(out).toContain(x.fromPeak > -0.05 ? 'at peak' : `▼${fmt(-x.fromPeak)}`);
    }
    expect(out.match(/data-mark="peak"/g)).toHaveLength(rows.length);
    expect(out.match(/data-mark="final"/g)).toHaveLength(rows.length);
  });

  it('final board rows follow the engine rank and never show a drop above zero', () => {
    const rows = finalBoardRows(read(false));
    expect(rows.map((x) => x.rank)).toEqual(rows.map((_, i) => i + 1));
    expect(rows.every((x) => x.fromPeak <= 0)).toBe(true);
  });

  it('trust trace draws the τ line and hatched band only when τ is published', () => {
    const off = html(createElement(TrustTrace, { r: read(false) }));
    const on = html(createElement(TrustTrace, { r: read(true) }));
    expect(off).not.toContain('τ');
    expect(off).not.toContain('class="lc-ref"');
    expect(on).toContain(`τ ${fmt(state.tau)} · a moratorium starts below this line`);
    expect(on).toContain('class="lc-ref"');
    expect(on).toMatch(/<rect[^>]*fill="url\(#c[^"]*-hd\)"/);
  });

  it('trust trace labels the moratorium quarter on the chart', () => {
    const r = read(false);
    const out = html(createElement(TrustTrace, { r }));
    if (r.collapseRound !== null) {
      expect(out).toContain(`moratorium from ${quarterLabel(r.collapseRound)}`);
      expect(out).toContain(`MORATORIUM ${quarterLabel(r.collapseRound)}`);
      expect(out).toContain('class="lc-mark"');
    } else expect(out).toContain('no moratorium');
  });

  it('a moratorium appears as a labelled vertical marker', () => {
    const r = { ...read(false), collapseRound: 3 };
    const out = html(createElement(TrustTrace, { r }));
    expect(out).toContain('class="lc-mark"');
    expect(out).toContain('MORATORIUM Q3 Y1');
  });

  it('counterfactual panel states the three headline figures and labels both lines on the chart', () => {
    const r = read(false);
    const out = html(createElement(Counterfactual, { r }));
    const f = headlineFigures(r);
    expect(out).toContain('INDUSTRY VALUE');
    expect(out).toContain(`>${fmt(r.industry.actual, 0)}<`);
    expect(out).toContain('ALTERNATIVE');
    expect(out).toContain(`>${fmt(r.industry.counterfactual, 0)}<`);
    expect(out).toContain(f.change.label);
    expect(out).toContain('>ACTUAL</text>');
    expect(out).toContain('>ALTERNATIVE</text>');
    expect(out).toContain('class="lc-band"');
    for (const x of rankedFirms(r)) expect(out).toContain(`data-firm="${x.ticker}"`);
  });

  it('attribution panel lists each firm with its damage and value shares at the bar ends', () => {
    const r = read(false);
    const out = html(createElement(Attribution, { r }));
    expect(out).toContain('SHARE OF DAMAGE');
    expect(out).toContain('SHARE OF VALUE');
    const { rows, anyPositive } = attributionRows(r);
    for (const a of rows) {
      expect(out).toContain(`>${fmtShare(a.damage)}<`);
      if (anyPositive) expect(out).toContain(`>${fmtShare(a.value)}<`);
    }
  });

  it('no panel uses the abbreviations SUST, ACT or DEPL', () => {
    const r = read(true);
    for (const el of [FinalBoard, TrustTrace, Counterfactual, Attribution]) {
      const out = html(createElement(el, { r }));
      expect(out).not.toMatch(/\b(SUST|ACT|DEPL)\b/);
    }
  });

  it('pact record reveals undetected violations', () => {
    const r = read(false);
    const out = html(createElement(PactRecord, { r }));
    expect(out).toContain('PACT-A');
    expect(out).toContain('UNDETECTED');
    const pact = r.pacts[0];
    expect(pact?.undetected).toBeGreaterThan(0);
    expect(out).toContain(`>${pact?.undetected}<`);
  });

  it('pact record says so when no pact was formed', () => {
    const r = { ...read(false), pacts: [] };
    expect(html(createElement(PactRecord, { r }))).toContain('No pacts were formed.');
  });
});

describe('participant results card', () => {
  it('shows own rank, valuation actual vs counterfactual, exposure share and undetected violations', () => {
    const r = read(false);
    const own = r.final.f0!;
    const out = html(createElement(OwnResultsCard, { ticker: own.ticker, firmId: 'f0', results: r, unavailable: false, rank: null, valuation: null }));
    expect(out).toContain(`RANK ${own.rank} OF 5`);
    expect(out).toContain(fmt(own.valuation));
    expect(out).toContain(fmt(own.counterfactual));
    expect(out).toContain(fmtShare(own.drawShare));
    expect(out).toContain(`<dd>${own.undetected}</dd>`);
    expect(out).toContain(`<dd>${own.detected}</dd>`);
  });

  it("never prints another firm's figures", () => {
    const r = read(false);
    const other = r.final.f1!;
    const out = html(createElement(OwnResultsCard, { ticker: r.final.f0!.ticker, firmId: 'f0', results: r, unavailable: false, rank: null, valuation: null }));
    expect(out).not.toContain(other.ticker);
  });

  it('falls back to the board figures while results are being written', () => {
    const out = html(createElement(OwnResultsCard, { ticker: 'ARCN', firmId: 'f0', results: null, unavailable: false, rank: 2, valuation: 123.4 }));
    expect(out).toContain('RANK 2');
    expect(out).toContain('123.4');
    expect(out).toContain('being prepared');
  });

  it('tells the participant when results cannot be read', () => {
    const out = html(createElement(OwnResultsCard, { ticker: 'ARCN', firmId: 'f0', results: null, unavailable: true, rank: null, valuation: null }));
    expect(out).toContain('cannot be read');
  });
});
