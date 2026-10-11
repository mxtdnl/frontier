/** NET CONTRIBUTION panel (spec §14.4 panel 5, Session 18): the results model, the headline and the participant card. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findViolations } from '../../scripts/lib/copy-rules';
import { PARAMS, buildResults, resolveRound, type ConductLedger, type Contribution, type EngineState, type FinalResults, type FirmContribution } from '../../src/engine';
import { fromResults } from '../../src/firebase/schema';
import { OwnResultsCard } from '../../src/screens/Results/OwnResultsCard';
import { NetContribution } from '../../src/screens/Results/Results';
import { contributionHeadline, panelHeadline } from '../../src/screens/Results/headlines';
import { DEBRIEF_PROMPTS, RESULT_PANELS, contributionRows, contributionView, ledgerLine, waterfallPoints } from '../../src/screens/Results/model';
import { storeAndRead } from '../firebase/rtdb';
import { dec, game } from '../engine/helpers';

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const text = (el: ReturnType<typeof createElement>) => html(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'");
const ledger = (over: Partial<ConductLedger> = {}): ConductLedger => ({
  publish: 0, share: 0, restraint: 0, compliant: 0, poach: 0, blitz: 0, lobby: 0, rush: 0, breaches: 0, incidents: 0, ...over,
});

/** A firm row: `vr` valuation rank, `nr` net rank. */
function firm(id: string, vr: number, nr: number, net: number, over: Partial<FirmContribution> = {}): FirmContribution {
  return {
    firmId: id, ticker: id.toUpperCase(), valuation: 100, valuationRank: vr, trustPoints: 0, marketEffect: net - 100, shareBenefit: 0, moratoriumShare: 0,
    researchCredit: 0, rivalry: { blitz: 0, poach: 0, rush: 0 }, rivalryTaken: 0, valueCreated: 0, damageCreated: 0, netContribution: net, rank: nr, ledger: ledger(), ...over,
  };
}
function results(firms: FirmContribution[], moratorium: Contribution['moratorium'] = null): FinalResults {
  return {
    rounds: 10, collapseRound: moratorium?.round ?? null, tau: null, startTrust: 72, trust: [70], final: {},
    industry: { actual: 0, counterfactual: 0, destroyed: 0 },
    counterfactual: { rounds: 10, industryTotal: 0, perFirm: 0, byFirm: {}, trust: [70], collapseRound: null },
    attribution: [], pacts: [], dataLines: [],
    contribution: { firms: Object.fromEntries(firms.map((f) => [f.firmId, f])), moratorium, researchCreditPerCard: 1 },
  };
}

describe('the headline sentence', () => {
  it('names the valuation leader’s fall and the largest rise', () => {
    const r = results([firm('humn', 1, 8, 10), firm('arcn', 9, 2, 300), firm('btc', 2, 1, 400), firm('cyra', 8, 9, 5), ...[3, 4, 5, 6, 7].map((k) => firm(`f${k}`, k, k - 1 === 2 ? 3 : k - 1, 50))]);
    expect(contributionHeadline(r)).toBe('Ranked by value created for the whole market, HUMN falls from 1st to 8th and ARCN rises from 9th to 2nd.');
  });

  it('says so when no firm changes place, as with ties broken the same way', () => {
    const r = results([firm('a', 1, 1, 100), firm('b', 2, 2, 100), firm('c', 3, 3, 90)]);
    expect(contributionHeadline(r)).toBe('Ranked by value created for the whole market, every firm keeps its place.');
  });

  it('says the leader holds 1st when only others move', () => {
    const r = results([firm('a', 1, 1, 100), firm('b', 2, 3, 50), firm('c', 3, 2, 60)]);
    expect(contributionHeadline(r)).toBe('Ranked by value created for the whole market, A holds 1st and C rises from 3rd to 2nd.');
  });

  it('adds a sentence when every net contribution is below zero', () => {
    const r = results([firm('a', 1, 2, -10), firm('b', 2, 1, -5)]);
    expect(contributionHeadline(r)).toBe(
      "Ranked by value created for the whole market, A falls from 1st to 2nd and B rises from 2nd to 1st. Every firm's net contribution is below zero.",
    );
  });

  it('states the moratorium cost and who is charged', () => {
    const m = { round: 9, revenue: 900, cash: 50, capability: 50, total: 1000, allocated: 1000 };
    const r = results([firm('a', 1, 2, -10, { moratoriumShare: 600 }), firm('b', 2, 1, 5, { moratoriumShare: 400 }), firm('c', 3, 3, -20)], m);
    expect(contributionHeadline(r)).toContain('The moratorium cost 1000, charged to the 2 firms that drew trust down before it.');
    const none = results([firm('a', 1, 1, 10)], { ...m, allocated: 0 });
    expect(contributionHeadline(none)).toContain('no firm had drawn trust down before it, so none is charged.');
  });

  it('handles results written before Session 18', () => {
    expect(contributionHeadline({ ...results([]), contribution: null })).toBe('Net contribution was not computed for this session.');
  });

  it('passes the copy rules, including the stricter projector rules', () => {
    const m = { round: 9, revenue: 900, cash: 50, capability: 50, total: 1000, allocated: 1000 };
    for (const r of [results([firm('a', 1, 2, -10, { moratoriumShare: 1000 }), firm('b', 2, 1, -5)], m), results([firm('a', 1, 1, 1)])]) {
      expect(findViolations(contributionHeadline(r), { allowNonTelegraphing: false })).toEqual([]);
    }
  });
});

describe('the results model', () => {
  it('is panel 5 of 7, before PACT RECORD and DEBRIEF, and the debrief refers to it', () => {
    expect(RESULT_PANELS).toEqual(['FINAL BOARD', 'TRUST TRACE', 'COUNTERFACTUAL', 'ATTRIBUTION', 'NET CONTRIBUTION', 'PACT RECORD', 'DEBRIEF']);
    expect(DEBRIEF_PROMPTS[2]).toBe(
      'Compare your share of the damage with your share of the value. Ranked by net contribution, where does your firm fall? Is that outcome fair, and who should pay?',
    );
  });

  it('formats the conduct ledger, for the market then against it', () => {
    expect(ledgerLine(ledger({ publish: 6, restraint: 9, poach: 2, blitz: 3, breaches: 1 }))).toBe('▲ PUBLISH 6 · restraint 9  ▼ POACH 2 · BLITZ 3 · breaches 1');
    expect(ledgerLine(ledger({ share: 1, compliant: 2, rush: 4, lobby: 1, incidents: 2 }))).toBe('▲ SHARE 1 · pact kept 2  ▼ LOBBY 1 · RUSH 4 · incidents 2');
    expect(ledgerLine(ledger())).toBe('▲ none  ▼ none');
  });

  it('marks rank changes of 3 or more', () => {
    const rows = contributionRows(results([firm('a', 1, 4, 1), firm('b', 4, 1, 9), firm('c', 2, 3, 3), firm('d', 3, 2, 5)]));
    expect(rows.map((x) => [x.ticker, x.move, x.highlight])).toEqual([['B', 3, 'up'], ['D', 1, null], ['C', -1, null], ['A', -3, 'down']]);
  });

  it('runs the waterfall from 0 through valuation, market effect, credit and rivalry to net', () => {
    expect(waterfallPoints({ valuation: 100, market: -30, credit: 5, rivalry: 20 })).toEqual([0, 100, 70, 75, 55]);
  });

  it('lists every firm up to 24, then the 12 largest rank changes and OTHERS', () => {
    const many = Array.from({ length: 30 }, (_, i) => firm(`f${i}`, i + 1, ((i * 7) % 30) + 1, 100 - i, { researchCredit: 1, rivalryTaken: 2 }));
    const v = contributionView(results(many));
    expect(v.rows).toHaveLength(12);
    expect(v.combined).toBe(18);
    expect(v.others?.credit).toBe(18);
    expect(v.others?.rivalry).toBe(36);
    expect(v.rows.map((x) => x.rank)).toEqual([...v.rows.map((x) => x.rank)].sort((a, b) => a - b));
    const moves = contributionRows(results(many)).map((x) => Math.abs(x.move)).sort((a, b) => b - a);
    expect(Math.min(...v.rows.map((x) => Math.abs(x.move)))).toBeGreaterThanOrEqual(moves[11]!);
    expect(contributionView(results(many.slice(0, 24))).others).toBeNull();
  });
});

describe('the panel and the participant card, from a played session', () => {
  function played(): EngineState {
    let s = game(6, { seed: 8 });
    for (let r = 1; r <= 8; r++) {
      s = resolveRound(
        s,
        {
          f0: dec(4, 0, r % 2 ? 'BLITZ' : 'RUSH'),
          f1: dec(2, 15, r % 2 ? 'PUBLISH' : 'NONE'),
          f2: dec(3, 5, r % 2 ? 'POACH' : 'NONE', r % 4 === 1 ? 'f0' : 'f1'),
          f3: dec(1, 30, r % 2 ? 'SHARE' : 'NONE'),
          f4: dec(4, 0),
          f5: dec(2, 15),
        },
        PARAMS,
      ).state;
    }
    return s;
  }
  const r = fromResults(storeAndRead(buildResults(played(), { revealTau: false }))) as FinalResults;

  it('survives the round trip through the database', () => {
    expect(r.contribution).not.toBeNull();
    expect(Object.keys(r.contribution!.firms)).toHaveLength(6);
    expect(r.contribution).toEqual(buildResults(played(), { revealTau: false }).contribution);
  });

  it('draws the slope chart and one figures row and ledger per firm, headline first', () => {
    const out = html(createElement(NetContribution, { r }));
    expect(out).toContain('data-chart="slope"');
    expect(out.indexOf('data-headline')).toBeLessThan(out.indexOf('<svg'));
    expect(out.match(/class="nc-firm" data-firm=/g)).toHaveLength(6);
    expect(out.match(/data-ledger=""/g)).toHaveLength(6);
    expect(out).toContain('research credit, not money');
    expect(text(createElement(NetContribution, { r }))).toContain(panelHeadline(r, 4));
  });

  it('shows the participant their net contribution, rank, research credit and ledger', () => {
    const mine = r.contribution!.firms.f1!;
    const out = text(createElement(OwnResultsCard, { ticker: 'BRLK', firmId: 'f1', results: r, unavailable: false, rank: null, valuation: null }));
    expect(out).toContain('YOUR NET CONTRIBUTION');
    expect(out).toContain(`RANK ${mine.rank} OF 6`);
    expect(out).toContain('Research credit (not money)');
    expect(out).toContain(mine.researchCredit.toFixed(1));
    expect(out).toContain(mine.netContribution.toFixed(1).replace('-', '−'));
    expect(out).toContain(ledgerLine(mine.ledger));
    expect(mine.ledger.publish).toBe(4);
  });

  it('shows no net contribution section for results written before Session 18', () => {
    const out = text(createElement(OwnResultsCard, { ticker: 'BRLK', firmId: 'f1', results: { ...r, contribution: null }, unavailable: false, rank: null, valuation: null }));
    expect(out).not.toContain('YOUR NET CONTRIBUTION');
  });
});
