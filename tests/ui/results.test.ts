import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PARAMS, buildResults, nextPactName, resolveRound, type EngineState, type Pact } from '../../src/engine';
import { fromResults } from '../../src/firebase/schema';
import { fmt, fmtShare } from '../../src/ui/format';
import { OwnResultsCard } from '../../src/screens/Results/OwnResultsCard';
import { Attribution, Counterfactual, FinalBoard, PactRecord, TrustTrace } from '../../src/screens/Results/Results';
import { barFraction, counterfactualTrustSeries, destroyedShare, pactLines, rankedFirms, trustSeries } from '../../src/screens/Results/model';
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

  it('bars draw no negative length and never exceed 1', () => {
    expect(barFraction(-5, 100)).toBe(0);
    expect(barFraction(250, 100)).toBe(1);
    expect(barFraction(50, 0)).toBe(0);
  });

  it('trust series start with the opening value', () => {
    expect(trustSeries(r)).toHaveLength(r.rounds + 1);
    expect(counterfactualTrustSeries(r)).toHaveLength(r.rounds + 1);
    expect(trustSeries(r)[0]).toBe(r.startTrust);
  });

  it('value destroyed share is relative to the counterfactual total', () => {
    const s = destroyedShare(r);
    if (r.industry.counterfactual > 0) expect(s).toBeCloseTo(r.industry.destroyed / r.industry.counterfactual, 12);
    else expect(s).toBeNull();
  });

  it('names members and undetected violators by ticker', () => {
    const lines = pactLines(r);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.members).toBe('ARCN BRLK');
    expect(lines[0]?.undetectedBy.every((x) => /^[A-Z]{4} \d+$/.test(x))).toBe(true);
  });
});

describe('results panels', () => {
  it('final board shows every firm with its final and peak valuation', () => {
    const r = read(false);
    const out = html(createElement(FinalBoard, { r }));
    for (const f of Object.values(r.final)) {
      expect(out).toContain(f.ticker);
      expect(out).toContain(fmt(f.valuation));
      expect(out).toContain(fmt(f.peakValuation));
    }
  });

  it('trust trace draws the tau line only when tau is published', () => {
    const off = html(createElement(TrustTrace, { r: read(false) }));
    const on = html(createElement(TrustTrace, { r: read(true) }));
    expect(off).not.toContain('Dashed line');
    expect(off).not.toContain('class="ref"');
    expect(on).toContain(`Dashed line: tau, ${fmt(state.tau, 0)}`);
    expect(on).toContain('class="ref"');
  });

  it('trust trace marks the collapse quarter', () => {
    const r = read(false);
    const out = html(createElement(TrustTrace, { r }));
    if (r.collapseRound !== null) expect(out).toContain('marker: collapse');
    else expect(out).toContain('no collapse');
  });

  it('counterfactual panel states the headline figures from the engine', () => {
    const r = read(false);
    const out = html(createElement(Counterfactual, { r }));
    expect(out).toContain(`INDUSTRY VALUE</span> ${fmt(r.industry.actual, 0)}`);
    expect(out).toContain(`SUSTAINABLE</span> ${fmt(r.industry.counterfactual, 0)}`);
    expect(out).toContain('VALUE DESTROYED');
  });

  it('attribution panel lists each firm with its depletion and value shares', () => {
    const r = read(false);
    const out = html(createElement(Attribution, { r }));
    for (const a of r.attribution) {
      expect(out).toContain(`${fmtShare(a.drawShare)} DEPL`);
      expect(out).toContain(`${fmtShare(a.valueShare)} VAL`);
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
