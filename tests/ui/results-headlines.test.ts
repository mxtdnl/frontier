import { describe, expect, it } from 'vitest';
import type { FinalResults, FirmFinal, PactFinal } from '../../src/engine';
import { findViolations } from '../../scripts/lib/copy-rules';
import {
  DEBRIEF_HEADLINE,
  attributionHeadline,
  counterfactualHeadline,
  finalBoardHeadline,
  ownResultSentence,
  pactHeadline,
  panelHeadline,
  trustHeadline,
} from '../../src/screens/Results/headlines';

type FirmSpec = { ticker: string; valuation: number; peak: number; draw?: number };

/** Minimal results: firms ranked by valuation, attribution by draw (then input order), shares from the inputs. */
function results(firms: FirmSpec[], opts: { trust?: number[]; start?: number; collapse?: number | null; alternative?: number; pacts?: PactFinal[] } = {}): FinalResults {
  const totalDraw = firms.reduce((a, f) => a + (f.draw ?? 1), 0);
  const totalValue = firms.reduce((a, f) => a + Math.max(0, f.valuation), 0);
  const byVal = [...firms].sort((a, b) => b.valuation - a.valuation);
  const final: Record<string, FirmFinal> = {};
  firms.forEach((f, i) => {
    const id = `f${i}`;
    final[id] = {
      firmId: id,
      ticker: f.ticker,
      isBot: false,
      rank: byVal.indexOf(f) + 1,
      valuation: f.valuation,
      peakValuation: f.peak,
      counterfactual: 0,
      drawShare: totalDraw > 0 ? (f.draw ?? 1) / totalDraw : 0,
      valueShare: totalValue > 0 ? Math.max(0, f.valuation) / totalValue : 0,
      cumulativeDraw: f.draw ?? 1,
      incidents: 0,
      insolvent: false,
      detected: 0,
      undetected: 0,
    };
  });
  const attribution = Object.values(final)
    .map((f) => ({ firmId: f.firmId, drawShare: f.drawShare, valueShare: f.valueShare, cumulativeDraw: f.cumulativeDraw, valuation: f.valuation }))
    .sort((a, b) => b.drawShare - a.drawShare);
  const trust = opts.trust ?? [70, 60];
  const actual = firms.reduce((a, f) => a + f.valuation, 0);
  const alternative = opts.alternative ?? actual * 2;
  return {
    rounds: trust.length,
    collapseRound: opts.collapse ?? null,
    tau: null,
    startTrust: opts.start ?? 72,
    trust,
    final,
    industry: { actual, counterfactual: alternative, destroyed: alternative - actual },
    counterfactual: { rounds: trust.length, industryTotal: alternative, perFirm: alternative / firms.length, byFirm: {}, trust, collapseRound: null },
    attribution,
    pacts: opts.pacts ?? [],
    dataLines: [],
  };
}

function pact(detected: number, undetected: number, status: PactFinal['status'] = 'active'): PactFinal {
  return { pactId: 'p', name: 'PACT-A', terms: { maxPace: 2, minSafety: null }, status, createdRound: 1, members: [], detected, undetected, perFirm: {}, quarters: {} };
}

describe('FINAL BOARD headline', () => {
  it('matches the spec example', () => {
    const firms: FirmSpec[] = [
      { ticker: 'AAAA', valuation: 50, peak: 50 },
      ...Array.from({ length: 6 }, (_, i) => ({ ticker: `B${i}XX`, valuation: 10 + i, peak: 40 })),
      { ticker: 'CCCC', valuation: -5, peak: 30 },
      { ticker: 'DDDD', valuation: -20, peak: 30 },
    ];
    expect(finalBoardHeadline(results(firms))).toBe('8 of 9 firms finished below their peak. 2 finished below zero.');
  });

  it('every firm at its peak, none below zero', () => {
    expect(finalBoardHeadline(results([{ ticker: 'AAAA', valuation: 10, peak: 10 }, { ticker: 'BBBB', valuation: 5, peak: 5.04 }]))).toBe(
      'Every firm finished at its peak. None finished below zero.',
    );
  });

  it('all below their peak and all below zero', () => {
    expect(finalBoardHeadline(results([{ ticker: 'AAAA', valuation: -1, peak: 10 }, { ticker: 'BBBB', valuation: -2, peak: 5 }]))).toBe(
      'All 2 firms finished below their peak. All 2 finished below zero.',
    );
  });

  it('one firm below its peak', () => {
    expect(finalBoardHeadline(results([{ ticker: 'AAAA', valuation: 1, peak: 10 }, { ticker: 'BBBB', valuation: 5, peak: 5 }, { ticker: 'CCCC', valuation: 2, peak: 2 }]))).toBe(
      '1 of 3 firms finished below its peak. None finished below zero.',
    );
  });

  it('a value that displays as 0.0 is not below zero', () => {
    expect(finalBoardHeadline(results([{ ticker: 'AAAA', valuation: -0.01, peak: 0 }, { ticker: 'BBBB', valuation: 5, peak: 5 }]))).toBe(
      'Every firm finished at its peak. None finished below zero.',
    );
  });
});

describe('TRUST TRACE headline', () => {
  it('fell, with no moratorium', () => {
    expect(trustHeadline(results([{ ticker: 'AAAA', valuation: 1, peak: 1 }], { start: 72, trust: Array.from({ length: 14 }, (_, i) => 70 - i * 1.8 - 0.2) }))).toBe(
      'Trust fell from 72.0 to 46.4 over 14 quarters.',
    );
  });

  it('adds the moratorium quarter', () => {
    expect(trustHeadline(results([{ ticker: 'AAAA', valuation: 1, peak: 1 }], { start: 72, trust: [60, 50, 30, 20, 15, 10], collapse: 6 }))).toBe(
      'Trust fell from 72.0 to 10.0 over 6 quarters. The moratorium began in Q2 Y2.',
    );
  });

  it('rose, held, and one quarter', () => {
    expect(trustHeadline(results([{ ticker: 'AAAA', valuation: 1, peak: 1 }], { start: 60, trust: [61, 64.5] }))).toBe('Trust rose from 60.0 to 64.5 over 2 quarters.');
    expect(trustHeadline(results([{ ticker: 'AAAA', valuation: 1, peak: 1 }], { start: 60, trust: [60.02] }))).toBe('Trust held at 60.0 over 1 quarter.');
  });

  it('no quarter resolved', () => {
    expect(trustHeadline(results([{ ticker: 'AAAA', valuation: 1, peak: 1 }], { trust: [] }))).toBe('No quarter was resolved.');
  });
});

describe('COUNTERFACTUAL headline', () => {
  const two = (a: number, b: number) => [{ ticker: 'AAAA', valuation: a, peak: Math.max(a, 1) }, { ticker: 'BBBB', valuation: b, peak: Math.max(b, 1) }];

  it('a ratio when the industry kept positive value', () => {
    expect(counterfactualHeadline(results(two(600, 400), { alternative: 3200 }))).toBe('Holding pace 2 and safety 15 would have left the industry worth 3.2× what it kept.');
  });

  it('a difference when the ratio would round to 1.0', () => {
    expect(counterfactualHeadline(results(two(600, 400), { alternative: 1040 }))).toBe('Holding pace 2 and safety 15 would have left the industry worth 40 more than it kept.');
  });

  it('both totals when the industry finished at or below zero', () => {
    expect(counterfactualHeadline(results(two(-500, 190), { alternative: 4210 }))).toBe('Holding pace 2 and safety 15 would have left the industry worth 4210; it finished at −310.');
    expect(counterfactualHeadline(results(two(-500, 190), { alternative: -50 }))).toBe('Holding pace 2 and safety 15 would have left the industry at −50; it finished at −310.');
  });

  it('actual above or equal to the alternative', () => {
    expect(counterfactualHeadline(results(two(600, 400), { alternative: 880 }))).toBe('The industry finished 120 above what holding pace 2 and safety 15 would have left.');
    expect(counterfactualHeadline(results(two(600, 400), { alternative: 1000.2 }))).toBe('The industry finished where holding pace 2 and safety 15 would have left it.');
  });

  it('names the alternative policy it is given', () => {
    expect(counterfactualHeadline(results(two(600, 400), { alternative: 2000 }), { pace: 1, safety: 20 })).toBe(
      'Holding pace 1 and safety 20 would have left the industry worth 2.0× what it kept.',
    );
  });
});

describe('ATTRIBUTION headline', () => {
  it('names the largest share of damage and its share of value', () => {
    const r = results([
      { ticker: 'HUMN', valuation: 299, peak: 300, draw: 248 },
      { ticker: 'BTCX', valuation: 701, peak: 800, draw: 752 },
    ]);
    expect(attributionHeadline(r)).toBe('BTCX caused 75.2% of the damage and kept 70.1% of the value.');
  });

  it('a firm below zero kept none of the value', () => {
    const r = results([
      { ticker: 'HUMN', valuation: -10, peak: 300, draw: 3 },
      { ticker: 'BTCX', valuation: 100, peak: 800, draw: 1 },
    ]);
    expect(attributionHeadline(r)).toBe('HUMN caused 75.0% of the damage and kept none of the value.');
  });

  it('a tie names every tied firm in ticker order', () => {
    const r = results([
      { ticker: 'HUMN', valuation: 300, peak: 300, draw: 2 },
      { ticker: 'BTCX', valuation: 100, peak: 800, draw: 2 },
      { ticker: 'ARCN', valuation: 100, peak: 800, draw: 1 },
    ]);
    expect(attributionHeadline(r)).toBe('BTCX and HUMN each caused 40.0% of the damage; they kept 20.0% and 60.0% of the value.');
    const three = results([
      { ticker: 'HUMN', valuation: 300, peak: 300 },
      { ticker: 'BTCX', valuation: -100, peak: 800 },
      { ticker: 'ARCN', valuation: 100, peak: 800 },
    ]);
    expect(attributionHeadline(three)).toBe('ARCN, BTCX and HUMN each caused 33.3% of the damage; they kept 25.0%, none and 75.0% of the value.');
  });

  it('no firm with positive value', () => {
    const r = results([
      { ticker: 'HUMN', valuation: -10, peak: 300, draw: 3 },
      { ticker: 'BTCX', valuation: -5, peak: 800, draw: 1 },
    ]);
    expect(attributionHeadline(r)).toBe('HUMN caused 75.0% of the damage. No firm finished with positive value.');
    const tie = results([
      { ticker: 'HUMN', valuation: -10, peak: 300 },
      { ticker: 'BTCX', valuation: -5, peak: 800 },
    ]);
    expect(attributionHeadline(tie)).toBe('BTCX and HUMN each caused 50.0% of the damage. No firm finished with positive value.');
  });

  it('no damage at all', () => {
    expect(attributionHeadline(results([{ ticker: 'HUMN', valuation: 1, peak: 1, draw: 0 }]))).toBe('No firm drew down trust.');
  });
});

describe('PACT RECORD headline', () => {
  const f = [{ ticker: 'AAAA', valuation: 1, peak: 1 }];
  it('no pacts', () => {
    expect(pactHeadline(results(f))).toBe('No pacts were formed.');
  });
  it('no breaches', () => {
    expect(pactHeadline(results(f, { pacts: [pact(0, 0)] }))).toBe('1 pact formed. Every member kept the terms.');
  });
  it('some undetected', () => {
    expect(pactHeadline(results(f, { pacts: [pact(2, 1), pact(1, 3, 'dissolved')] }))).toBe(
      '2 pacts formed; 1 dissolved. Members broke the terms 7 times; 4 breaches were never detected.',
    );
    expect(pactHeadline(results(f, { pacts: [pact(1, 1)] }))).toBe('1 pact formed. Members broke the terms twice; 1 breach was never detected.');
  });
  it('all detected, none detected, and all dissolved', () => {
    expect(pactHeadline(results(f, { pacts: [pact(3, 0)] }))).toBe('1 pact formed. Members broke the terms 3 times; every breach was detected.');
    expect(pactHeadline(results(f, { pacts: [pact(1, 0)] }))).toBe('1 pact formed. Members broke the terms once; the breach was detected.');
    expect(pactHeadline(results(f, { pacts: [pact(0, 1)] }))).toBe('1 pact formed. Members broke the terms once; the breach was never detected.');
    expect(pactHeadline(results(f, { pacts: [pact(0, 2, 'dissolved'), pact(0, 2, 'dissolved')] }))).toBe(
      '2 pacts formed; all dissolved. Members broke the terms 4 times; no breach was detected.',
    );
  });
});

describe('participant card sentence', () => {
  it('below the peak, as a percentage', () => {
    expect(ownResultSentence({ rank: 2, valuation: 87.5, peakValuation: 100 }, 9)).toBe('You finished 2nd of 9, 12.5% below your peak.');
  });
  it('at the peak', () => {
    expect(ownResultSentence({ rank: 1, valuation: 100, peakValuation: 100.04 }, 9)).toBe('You finished 1st of 9, at your peak.');
  });
  it('below zero, with and without a higher peak', () => {
    expect(ownResultSentence({ rank: 9, valuation: -20, peakValuation: 100 }, 9)).toBe('You finished 9th of 9, below zero at −20.0, from a peak of 100.0.');
    expect(ownResultSentence({ rank: 11, valuation: -20, peakValuation: -20 }, 12)).toBe('You finished 11th of 12, below zero at −20.0.');
  });
});

describe('panel order and copy', () => {
  const r = results(
    [
      { ticker: 'HUMN', valuation: -10, peak: 300, draw: 3 },
      { ticker: 'BTCX', valuation: 50, peak: 800, draw: 1 },
    ],
    { pacts: [pact(1, 2)], collapse: 2 },
  );

  it('one headline per panel, debrief fixed', () => {
    expect([0, 1, 2, 3, 4].map((i) => panelHeadline(r, i))).toEqual([
      finalBoardHeadline(r),
      trustHeadline(r),
      counterfactualHeadline(r),
      attributionHeadline(r),
      pactHeadline(r),
    ]);
    expect(panelHeadline(r, 5)).toBe(DEBRIEF_HEADLINE);
  });

  it('every headline passes the copy rules, including the stricter projector rules', () => {
    const all = [0, 1, 2, 3, 4, 5].map((i) => panelHeadline(r, i));
    all.push(ownResultSentence({ rank: 2, valuation: 87.5, peakValuation: 100 }, 9));
    for (const line of all) {
      expect(findViolations(line, { allowNonTelegraphing: false }), line).toEqual([]);
      expect(line).not.toMatch(/!/);
    }
  });
});
