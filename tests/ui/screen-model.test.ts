import { describe, expect, it } from 'vitest';
import { PARAMS } from '../../src/engine';
import {
  INITIAL_VALUATION,
  boardRows,
  committedCount,
  joinUrl,
  leadersOf,
  marketAndValue,
  previousTrust,
  revealInput,
  tagKey,
  tickerTone,
  tickerWireItems,
  trustSeries,
  valuationSeries,
  wireItems,
  type ScreenData,
} from '../../src/screens/Screen/model';
import type { FirmNode, FirmPublicNode, PublicNode, RoundNode, WireNode } from '../../src/firebase/schema';

const firm = (ticker: string, createdAt: number, isBot = false): FirmNode => ({ name: `${ticker} Inc`, ticker, createdAt, order: 0, isBot, botPolicy: isBot ? 'standard' : null });
const fp = (over: Partial<FirmPublicNode>): FirmPublicNode => ({
  share: 0.5, profit: 0, valuation: INITIAL_VALUATION, rank: 1, rankDelta: 0, submittedRound: 0, auto: false, insolvent: false, breachUntilRound: 0, ...over,
});
const round = (T: number, results: RoundNode['results'], headlines: RoundNode['headlines'] = []): RoundNode => ({
  T, dT: 0, M: 100, incidents: 1, incidentFirms: [], resolvedAt: null, headlines, audits: [], disclosure: null, results,
});
const pub = (over: Partial<PublicNode> = {}): PublicNode => ({
  phase: 'open', round: 2, deadline: 1, paused: false, disclosure: false, T: 70, M: 500, collapsed: false, collapseRound: null,
  joinLocked: true, resolvingBy: null, endedAt: null, revealStep: 0, resumePhase: null, pausedRemainingMs: null, ...over,
});

function data(over: Partial<ScreenData> = {}): ScreenData {
  return {
    pub: pub(),
    meta: { code: 'ABCD', title: 't', createdAt: 0, facilitatorUid: 'f', settings: { mode: 'team', timerSec: 120, autoResolve: false, revealThreshold: false, litRoom: false } },
    firms: { a: firm('AAA', 1), b: firm('BBB', 2, true) },
    firmsPublic: {
      a: fp({ rank: 2, rankDelta: -1, valuation: 90, share: 0.4, profit: 5, submittedRound: 2 }),
      b: fp({ rank: 1, rankDelta: 1, valuation: 120, share: 0.6, profit: 9, submittedRound: 1, auto: true }),
    },
    rounds: {
      '1': round(80, { a: { share: 0.5, profit: 2, valuation: 100, rank: 1 }, b: { share: 0.5, profit: 3, valuation: 95, rank: 2 } }, [{ kind: 'ambient', text: 'One' }]),
      '2': round(70, { a: { share: 0.4, profit: 5, valuation: 90, rank: 2 }, b: { share: 0.6, profit: 9, valuation: 120, rank: 1 } }, [{ kind: 'rank', text: 'Two' }, { kind: 'ambient', text: 'Three' }]),
    },
    pacts: {},
    wire: {},
    memberCounts: {},
    ...over,
  };
}

describe('boardRows', () => {
  it('sorts by rank and derives the previous row order from rankDelta', () => {
    const rows = boardRows(data());
    expect(rows.map((r) => r.ticker)).toEqual(['BBB', 'AAA']);
    expect(rows[0]?.prevIndex).toBe(1);
    expect(rows[1]?.prevIndex).toBe(0);
  });

  it('computes change against the previous quarter, and against the opening value in quarter 1', () => {
    const rows = boardRows(data());
    expect(rows[0]).toMatchObject({ value: 120, prevValue: 95, dValue: 25, prevShare: 0.5, prevProfit: 3 });
    const q1 = boardRows(data({ rounds: { '1': data().rounds['1'] as RoundNode }, pub: pub({ round: 1 }) }));
    expect(q1[0]?.prevValue).toBe(INITIAL_VALUATION);
    expect(q1[0]?.prevProfit).toBe(0);
  });

  it('marks committed firms for the current quarter only, and hides stale AUTO while open', () => {
    const rows = boardRows(data());
    expect(rows.find((r) => r.ticker === 'AAA')?.committed).toBe(true);
    expect(rows.find((r) => r.ticker === 'BBB')?.committed).toBe(false);
    expect(committedCount(rows)).toBe(1);
    expect(rows.find((r) => r.ticker === 'BBB')?.auto).toBe(false);
    expect(boardRows(data({ pub: pub({ phase: 'reveal' }) })).find((r) => r.ticker === 'BBB')?.auto).toBe(true);
  });

  it('shows BREACH while the quarter is within breachUntilRound', () => {
    const d = data();
    d.firmsPublic.a = fp({ rank: 2, breachUntilRound: 3 });
    expect(boardRows(d).find((r) => r.ticker === 'AAA')?.breach).toBe(true);
    d.pub = pub({ round: 4 });
    expect(boardRows(d).find((r) => r.ticker === 'AAA')?.breach).toBe(false);
  });

  it('lists active pacts only, and takes disclosure from the last published snapshot', () => {
    const d = data({ pub: pub({ disclosure: true }) });
    d.pacts = {
      p1: { id: 'p1', name: 'PACT-A', proposer: 'a', terms: { maxPace: 2, minSafety: null }, members: { a: 1 }, createdRound: 1, status: 'active' },
      p2: { id: 'p2', name: 'PACT-B', proposer: 'a', terms: { maxPace: 2, minSafety: null }, members: { a: 1 }, createdRound: 1, status: 'dissolved' },
    };
    d.rounds['2'] = { ...(d.rounds['2'] as RoundNode), disclosure: { a: { pace: 3, safety: 4, expo: 1.5, risk: null } } };
    const a = boardRows(d).find((r) => r.ticker === 'AAA');
    expect(a?.pacts).toEqual(['PACT-A']);
    expect(a?.disclosed).toEqual({ pace: 3, safety: 4, expo: 1.5, risk: null });
    expect(boardRows(data({ pub: pub({ disclosure: false }) }))[0]?.disclosed).toBeNull();
  });
});

describe('series and wire', () => {
  it('starts trust at the opening value and reports the previous quarter', () => {
    const d = data();
    expect(trustSeries(d.rounds)).toEqual([PARAMS.T0, 80, 70]);
    expect(previousTrust(d.rounds)).toBe(80);
    expect(previousTrust({})).toBe(PARAMS.T0);
  });

  it('lists headlines newest quarter first', () => {
    expect(wireItems(data().rounds).map((h) => h.text)).toEqual(['Two', 'Three', 'One']);
  });

  it('builds a firm valuation series', () => {
    expect(valuationSeries('a', data().rounds)).toEqual([INITIAL_VALUATION, 100, 90]);
  });
});

describe('joinUrl', () => {
  it('builds the join address from the page address, dropping the query and old hash', () => {
    expect(joinUrl('KXMT', 'https://mxtdnl.github.io/frontier/#/screen/g1?view=trust')).toBe('https://mxtdnl.github.io/frontier/#/j/KXMT');
  });
});

describe('reveal input (Session 12)', () => {
  it('takes the latest quarter, the trust before it and the leaders of both quarters', () => {
    expect(revealInput(data())).toEqual({ round: 2, T: 70, prevT: 80, incidents: 1, leaders: ['BBB'], prevLeaders: ['AAA'], collapseRound: null });
  });
  it('is null before quarter 1', () => {
    expect(revealInput(data({ rounds: {} }))).toBeNull();
  });
  it('lists every firm tied at the top valuation', () => {
    const r = round(70, { a: { share: 0.5, profit: 1, valuation: 110, rank: 1 }, b: { share: 0.5, profit: 1, valuation: 110, rank: 2 } });
    expect(leadersOf(r, data().firms)).toEqual(['AAA', 'BBB']);
    expect(leadersOf(undefined, data().firms)).toEqual([]);
  });
  it('carries the moratorium quarter only while it is in force', () => {
    expect(revealInput(data({ pub: pub({ collapsed: true, collapseRound: 2 }) }))?.collapseRound).toBe(2);
  });
});

describe('ticker tone (Session 12)', () => {
  it('marks harm in the down colour, clean audits up, the rest wire', () => {
    for (const k of ['incident', 'breach', 'insolvency', 'moratorium']) expect(tickerTone(k), k).toBe('down');
    expect(tickerTone('audit-clean')).toBe('up');
    for (const k of ['rank', 'ambient', 'trust-band', 'pact-formed', 'disclosure-on']) expect(tickerTone(k), k).toBe('wire');
  });
});

describe('board key strip (Session 12)', () => {
  it('lists only the tags on screen, in board priority order', () => {
    expect(tagKey([['BOT'], ['BREACH', 'AUTO']], false).map((k) => k.tag)).toEqual(['BREACH', 'AUTO', 'BOT']);
    expect(tagKey([[], []], false)).toEqual([]);
  });
  it('gives one entry for pact tags and one for a +N count', () => {
    expect(tagKey([['PACT-A']], false)).toEqual([{ tag: 'PACT-A', text: 'pact member' }]);
    const k = tagKey([['PACT-B'], ['PACT-A', 'BOT']], true);
    expect(k.map((x) => x.tag)).toEqual(['BOT', 'PACT-', '+N']);
  });
});

describe('MARKET and INDUSTRY VALUE (Session 20)', () => {
  const openMarket = (n: number) => PARAMS.M_PER_FIRM * n * Math.pow(PARAMS.T0 / PARAMS.TRUST_MAX, PARAMS.GAMMA);
  it('before quarter 1 shows the opening values and no change', () => {
    expect(marketAndValue({}, 4)).toEqual({ market: openMarket(4), marketDelta: null, value: INITIAL_VALUATION * 4, valueDelta: null });
  });
  it('quarter 1 is measured against the opening values', () => {
    const r = { '1': { ...round(80, { a: { share: 0.5, profit: 2, valuation: 100, rank: 1 }, b: { share: 0.5, profit: 3, valuation: 95, rank: 2 } }), M: 150 } };
    const mv = marketAndValue(r, 2);
    expect(mv.market).toBe(150);
    expect(mv.marketDelta).toBeCloseTo(150 - openMarket(2), 9);
    expect(mv.value).toBe(195);
    expect(mv.valueDelta).toBeCloseTo(195 - 2 * INITIAL_VALUATION, 9);
  });
  it('a shrinking market with rising total value reads ▼ and ▲', () => {
    const d = data();
    d.rounds['2'] = { ...(d.rounds['2'] as RoundNode), M: 80 };
    const mv = marketAndValue(d.rounds, 2);
    expect(mv.marketDelta).toBe(-20);
    expect(mv.value).toBe(210);
    expect(mv.valueDelta).toBe(15);
  });
  it('uses only public round results', () => {
    expect(Object.keys(marketAndValue(data().rounds, 2)).sort()).toEqual(['market', 'marketDelta', 'value', 'valueDelta']);
  });
});

describe('ticker: latest quarter only (Session 20)', () => {
  const ev = (round: number, seq: number, text: string, at: number): WireNode => ({ at, round, seq, kind: 'pact-formed', text, pact: null, firm: null, joined: null });
  const wire = {
    w0: ev(0, -0.5, 'Pre', 1),
    w1: ev(1, 1, 'Reveal one', 2),
    w2: ev(2, 1.5, 'Open two', 3),
    w3: ev(2, 2, 'Reveal two', 4),
    w4: ev(3, 2.5, 'Open three', 5),
  };
  it('keeps the latest resolved quarter and the events since, newest first', () => {
    expect(tickerWireItems(data().rounds, wire).map((h) => h.text)).toEqual(['Open three', 'Reveal two', 'Two', 'Three']);
  });
  it('drops every earlier quarter that the full log keeps', () => {
    const all = wireItems(data().rounds, wire).map((h) => h.text);
    expect(all).toContain('One');
    expect(all).toContain('Pre');
    expect(tickerWireItems(data().rounds, wire).map((h) => h.text)).not.toContain('One');
  });
  it('before quarter 1 resolves shows every event so far', () => {
    expect(tickerWireItems({}, { w0: wire.w0 }).map((h) => h.text)).toEqual(['Pre']);
  });
});
