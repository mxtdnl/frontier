import { describe, expect, it } from 'vitest';
import { PARAMS } from '../../src/engine';
import {
  INITIAL_VALUATION,
  boardRows,
  committedCount,
  joinUrl,
  leadersOf,
  previousTrust,
  revealInput,
  tagKey,
  tickerTone,
  trustSeries,
  valuationSeries,
  wireItems,
  type ScreenData,
} from '../../src/screens/Screen/model';
import type { FirmNode, FirmPublicNode, PublicNode, RoundNode } from '../../src/firebase/schema';

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
