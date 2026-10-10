import { describe, expect, it } from 'vitest';
import type { RoundNode } from '../../src/firebase/schema';
import {
  barSpan,
  bookSentence,
  fieldSeries,
  largestFaller,
  leaderOf,
  ordinal,
  rankByQuarter,
  rankMove,
  ranksHeadline,
  segmentLabel,
  shareSegments,
  sharedDomain,
  trendWindow,
  valuationHistory,
  type FirmRef,
} from '../../src/ui/performance';
import { BOARD_TAGS_MIN, boardChartWidths, firmsGrid, firmsPage } from '../../src/ui/layout';

const round = (results: Record<string, [number, number]>): RoundNode => ({
  T: 70,
  dT: 0,
  M: 1,
  incidents: 0, incidentFirms: [],
  headlines: [],
  audits: [],
  disclosure: null,
  results: Object.fromEntries(Object.entries(results).map(([id, [valuation, rank]]) => [id, { share: 0, profit: 0, valuation, rank }])),
});

const F: FirmRef[] = [
  { id: 'a', ticker: 'HUMN' },
  { id: 'b', ticker: 'BTC' },
  { id: 'c', ticker: 'ARC' },
];

/** HUMN climbs to 1st, BTC falls from 1st to 3rd, ARC holds 2nd. */
const ROUNDS: Record<string, RoundNode> = {
  '1': round({ a: [100, 3], b: [300, 1], c: [200, 2] }),
  '2': round({ a: [250, 2], b: [280, 1], c: [200, 3] }),
  '3': round({ a: [400, 1], b: [150, 3], c: [210, 2] }),
};

describe('rank by quarter', () => {
  it('orders each quarter by valuation and matches the stored ranks', () => {
    const t = rankByQuarter(F, ROUNDS);
    expect(t.rounds).toEqual([1, 2, 3]);
    expect(t.ranks).toEqual({ a: [3, 2, 1], b: [1, 1, 3], c: [2, 3, 2] });
  });

  it('breaks a valuation tie by the engine rank, then by ticker', () => {
    const tied = { '1': round({ a: [100, 2], b: [100, 1], c: [50, 3] }) };
    expect(rankByQuarter(F, tied).ranks).toEqual({ a: [2], b: [1], c: [3] });
    // No stored rank to separate them: ARC before HUMN by ticker, the same on every call.
    const bare = { '1': round({ a: [100, 0], c: [100, 0], b: [50, 0] }) };
    for (const r of Object.values(bare['1']!.results)) delete (r as { rank?: number }).rank;
    expect(rankByQuarter(F, bare).ranks).toEqual({ a: [2], b: [3], c: [1] });
    expect(rankByQuarter([...F].reverse(), bare).ranks).toEqual({ a: [2], b: [3], c: [1] });
  });

  it('ranks a firm with no result last, and is empty before quarter 1', () => {
    expect(rankByQuarter(F, { '1': round({ a: [10, 1], b: [5, 2] }) }).ranks.c).toEqual([3]);
    expect(rankByQuarter(F, {})).toEqual({ rounds: [], ranks: { a: [], b: [], c: [] } });
  });
});

describe('rank movement', () => {
  it('counts places gained as positive and places lost as negative', () => {
    expect(rankMove([3, 2, 1])).toBe(1);
    expect(rankMove([1, 1, 3])).toBe(-2);
    expect(rankMove([2, 2])).toBe(0);
    expect(rankMove([4])).toBe(0);
    expect(rankMove([])).toBe(0);
  });
});

describe('largest faller', () => {
  it('is the firm furthest below its best rank', () => {
    const t = rankByQuarter(F, ROUNDS);
    expect(leaderOf(F, t)?.ticker).toBe('HUMN');
    expect(largestFaller(F, t)).toEqual({ firm: F[1], best: 1, now: 3 });
  });

  it('breaks a tie by ticker and never picks a firm at its best', () => {
    const t = { rounds: [1, 2], ranks: { a: [1, 1], b: [2, 3], c: [3, 4], d: [4, 2] } };
    const firms = [...F, { id: 'd', ticker: 'ZED' }];
    // BTC and ARC both fell one place; ARC comes first by ticker.
    expect(largestFaller(firms, t)?.firm.ticker).toBe('ARC');
    expect(largestFaller(firms, { rounds: [1], ranks: { a: [1], b: [2], c: [3], d: [4] } })).toBeNull();
  });
});

describe('RANKS headline', () => {
  it('names the leader and the faller', () => {
    expect(ranksHeadline(F, rankByQuarter(F, ROUNDS))).toBe('HUMN rose to 1st. BTC fell from 1st to 3rd.');
  });

  it('says holds when the leader was already 1st, and when nothing fell', () => {
    const r = { '1': ROUNDS['1']!, '2': round({ a: [100, 3], b: [400, 1], c: [200, 2] }) };
    expect(ranksHeadline(F, rankByQuarter(F, r))).toBe('BTC holds 1st. No firm is below its best rank.');
    expect(ranksHeadline(F, rankByQuarter(F, { '1': ROUNDS['1']! }))).toBe('BTC is 1st after Q1 Y1. No firm is below its best rank.');
    expect(ranksHeadline(F, rankByQuarter(F, {}))).toBe('');
  });

  it('writes ordinals correctly', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 50].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '50th']);
  });
});

describe('BOOK sentence', () => {
  it('counts the quarters at 1st', () => {
    expect(bookSentence([3, 1, 1, 1], 9)).toBe('Rank 1 of 9. Highest valuation for 3 quarters running.');
    expect(bookSentence([2, 1], 9)).toBe('Rank 1 of 9. Highest valuation this quarter.');
    expect(bookSentence([1], 9)).toBe('Rank 1 of 9. Highest valuation this quarter.');
  });

  it('states the move otherwise', () => {
    expect(bookSentence([5, 3], 9)).toBe('Rank 3 of 9. Up 2 places since last quarter.');
    expect(bookSentence([2, 3], 9)).toBe('Rank 3 of 9. Down 1 place since last quarter.');
    expect(bookSentence([4, 4], 9)).toBe('Rank 4 of 9. Same place as last quarter.');
    expect(bookSentence([4], 9)).toBe('Rank 4 of 9.');
    expect(bookSentence([], 9)).toBe('');
  });
});

describe('share strip segments', () => {
  const rows = [
    { id: 'a', ticker: 'HUMN', value: 300 },
    { id: 'b', ticker: 'BTC', value: 100 },
    { id: 'c', ticker: 'ARC', value: -50 },
    { id: 'd', ticker: 'DEX', value: 100 },
    { id: 'e', ticker: 'ZERO', value: 0 },
  ];

  it('sums to 1 over the firms above zero, in value order with ties by ticker', () => {
    const { segments, below } = shareSegments(rows);
    expect(segments.map((s) => s.ticker)).toEqual(['HUMN', 'BTC', 'DEX']);
    expect(segments.map((s) => s.share)).toEqual([0.6, 0.2, 0.2]);
    expect(Math.abs(segments.reduce((s, x) => s + x.share, 0) - 1)).toBeLessThan(1e-9);
    expect(below).toBe(1);
  });

  it('fades by rank in five steps', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, ticker: `T${i}`, value: 100 - i }));
    expect(shareSegments(many).segments.map((s) => s.fade)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('is empty when no firm is above zero', () => {
    expect(shareSegments([{ id: 'a', ticker: 'A', value: -1 }])).toEqual({ segments: [], below: 1 });
  });

  it('labels only segments wide enough for ticker and percentage', () => {
    expect(segmentLabel({ ticker: 'HUMN', share: 0.3 }, 60)).toBe('HUMN 30%');
    expect(segmentLabel({ ticker: 'HUMN', share: 0.1 }, 60)).toBeNull();
    expect(segmentLabel({ ticker: 'HUMN', share: 0.15 }, 60)).toBe('HUMN 15%');
  });
});

describe('valuation series', () => {
  it('starts at the opening value and repeats the last value for a missing quarter', () => {
    expect(valuationHistory('c', { ...ROUNDS, '4': round({ a: [1, 1] }) }, 50)).toEqual([50, 200, 200, 210, 210]);
  });

  it('keeps the last 14 points for the board trend line', () => {
    const v = Array.from({ length: 20 }, (_, i) => i);
    expect(trendWindow(v)).toEqual(v.slice(6));
    expect(trendWindow([1, 2])).toEqual([1, 2]);
  });

  it('shares one domain that includes zero', () => {
    expect(sharedDomain([[10, 20], [5, 40]])).toEqual([0, 40]);
    expect(sharedDomain([[-10, 20], [5]])).toEqual([-10, 20]);
    expect(sharedDomain([[0]])).toEqual([0, 1]);
  });

  it('draws bars from zero: positive to the right, negative to the left', () => {
    expect(barSpan(20, [-10, 30])).toEqual({ zero: 0.25, start: 0.25, width: 0.5 });
    expect(barSpan(-10, [-10, 30])).toEqual({ zero: 0.25, start: 0, width: 0.25 });
    expect(barSpan(0, [0, 30])).toEqual({ zero: 0, start: 0, width: 0 });
  });

  it('builds the BOOK field from round results only', () => {
    const f = fieldSeries(['a', 'b', 'c'], 'a', ROUNDS);
    expect(f).toEqual({ start: 1, own: [100, 250, 400], others: [[300, 280, 150], [200, 200, 210]] });
    expect(fieldSeries(['a', 'b'], 'a', {})).toEqual({ start: 1, own: [], others: [] });
  });
});

describe('board bar and trend widths', () => {
  it('keeps two tags first, then the bar, then the trend line', () => {
    expect(boardChartWidths(42)).toEqual({ bar: 12, trend: 14 });
    expect(boardChartWidths(29)).toEqual({ bar: 6, trend: 8 });
    expect(boardChartWidths(21)).toEqual({ bar: 6, trend: 0 });
    expect(boardChartWidths(13)).toEqual({ bar: 0, trend: 0 });
    for (let free = 0; free <= 60; free++) {
      const { bar, trend } = boardChartWidths(free);
      if (bar + trend > 0) expect(free - bar - trend).toBeGreaterThanOrEqual(BOARD_TAGS_MIN);
      expect(bar === 0 || (bar >= 6 && bar <= 12)).toBe(true);
      expect(trend === 0 || (trend >= 8 && trend <= 14)).toBe(true);
    }
  });
});

describe('FIRMS grid', () => {
  it('is 3 × 3 up to 9 firms, 4 × 4 up to 16, then pages of 16; only the rows needed are drawn', () => {
    expect(firmsGrid(2)).toEqual({ cols: 3, rows: 1, pages: 1 });
    expect(firmsGrid(4)).toEqual({ cols: 3, rows: 2, pages: 1 });
    expect(firmsGrid(9)).toEqual({ cols: 3, rows: 3, pages: 1 });
    expect(firmsGrid(10)).toEqual({ cols: 4, rows: 3, pages: 1 });
    expect(firmsGrid(12)).toEqual({ cols: 4, rows: 3, pages: 1 });
    expect(firmsGrid(16)).toEqual({ cols: 4, rows: 4, pages: 1 });
    expect(firmsGrid(17)).toEqual({ cols: 4, rows: 4, pages: 2 });
    expect(firmsGrid(50)).toEqual({ cols: 4, rows: 4, pages: 4 });
  });

  it('pages wrap, and the last page holds the rest', () => {
    const ids = Array.from({ length: 50 }, (_, i) => i);
    expect(firmsPage(ids, 3).items).toEqual([48, 49]);
    expect(firmsPage(ids, 4)).toMatchObject({ page: 0, pages: 4 });
    expect(firmsPage(ids.slice(0, 5), 7)).toEqual({ items: [0, 1, 2, 3, 4], page: 0, pages: 1 });
  });
});
