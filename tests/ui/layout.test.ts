import { describe, expect, it } from 'vitest';
import {
  balancedPages,
  boardMode,
  boardPage,
  boardPageCount,
  counterfactualPages,
  fillColumns,
  filterByTicker,
  finalBoardPages,
  lobbyColumns,
  resultColumns,
  resultPageCounts,
  resultsPositionLabel,
  stepResultsPosition,
  tickerLine,
  truncateList,
  type Ranked,
} from '../../src/ui/layout';

const COUNTS = [2, 4, 8, 12, 13, 16, 17, 24, 32, 33, 40, 49, 50];

type Row = Ranked & { id: string };
const ranked = (n: number, moves: Record<number, number> = {}): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `f${i + 1}`, rank: i + 1, move: moves[i + 1] ?? 0 }));

describe('board mode', () => {
  it('uses two-line rows to 12 firms, one-line rows to 16 and pages above', () => {
    expect(boardMode(2)).toBe('tall');
    expect(boardMode(12)).toBe('tall');
    expect(boardMode(13)).toBe('compact');
    expect(boardMode(16)).toBe('compact');
    expect(boardMode(17)).toBe('paged');
    expect(boardMode(50)).toBe('paged');
  });

  it('pages 10 firms at a time', () => {
    expect(boardPageCount(16)).toBe(1);
    expect(boardPageCount(17)).toBe(2);
    expect(boardPageCount(40)).toBe(4);
    expect(boardPageCount(50)).toBe(5);
  });
});

describe('board page', () => {
  it('returns every row unpaged up to 16 firms', () => {
    const p = boardPage(ranked(16), 3);
    expect(p.rows).toHaveLength(16);
    expect(p.pinned).toEqual([]);
    expect(p.pages).toBe(1);
  });

  it('covers every firm exactly once across the pages, in rank order', () => {
    for (const n of COUNTS.filter((c) => c > 16)) {
      const rows = ranked(n);
      const seen: string[] = [];
      for (let i = 0; i < boardPageCount(n); i++) seen.push(...boardPage(rows, i).rows.map((r) => r.id));
      expect(seen).toEqual(rows.map((r) => r.id));
    }
  });

  it('wraps the page counter, so a rotation tick can be passed directly', () => {
    expect(boardPage(ranked(50), 5).page).toBe(0);
    expect(boardPage(ranked(50), 7).page).toBe(2);
    expect(boardPage(ranked(50), -1).page).toBe(4);
  });

  it('pins the leader off page 1 but not on it', () => {
    expect(boardPage(ranked(50), 0).pinned).toEqual([]);
    expect(boardPage(ranked(50), 2).pinned.map((r) => r.id)).toEqual(['f1']);
  });

  it('pins the largest mover of 3 or more places, at most 2 rows in all, sorted by rank', () => {
    const rows = ranked(50, { 7: 3, 30: -5, 44: 9, 45: 2 });
    const p = boardPage(rows, 1); // ranks 11–20
    expect(p.pinned.map((r) => r.id)).toEqual(['f1', 'f44']);
    const q = boardPage(rows, 0); // leader on the page: two movers
    expect(q.pinned.map((r) => r.id)).toEqual(['f30', 'f44']);
  });

  it('never pins a firm already on the page, nor a move under 3', () => {
    const rows = ranked(30, { 25: 4, 15: 2 });
    const p = boardPage(rows, 2); // ranks 21–30
    expect(p.pinned.map((r) => r.id)).toEqual(['f1']);
    expect(boardPage(rows, 1).pinned.map((r) => r.id)).toEqual(['f1', 'f25']);
  });

  it('never shows more than 12 rows, the two-line capacity', () => {
    for (const n of COUNTS) {
      const rows = ranked(n, { [n]: -10, [Math.ceil(n / 2)]: 6 });
      for (let i = 0; i < boardPageCount(n); i++) {
        const p = boardPage(rows, i);
        expect(p.rows.length + p.pinned.length).toBeLessThanOrEqual(n <= 16 ? 16 : 12);
      }
    }
  });
});

describe('lobby columns', () => {
  it('keeps the table to 16 firms and uses up to 4 columns above', () => {
    expect(lobbyColumns(16)).toBe(0);
    expect(lobbyColumns(17)).toBe(2);
    expect(lobbyColumns(32)).toBe(2);
    expect(lobbyColumns(33)).toBe(3);
    expect(lobbyColumns(50)).toBe(4);
    expect(lobbyColumns(80)).toBe(4);
  });

  it('fills columns top to bottom with no firm lost', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const cols = fillColumns(items, 4);
    expect(cols.map((c) => c.length)).toEqual([13, 13, 13, 11]);
    expect(cols.flat()).toEqual(items);
    expect(fillColumns([1, 2], 4).flat()).toEqual([1, 2]);
  });
});

describe('long lists', () => {
  it('shows up to 12 in full, otherwise the first 10 and a count', () => {
    const t = (n: number) => Array.from({ length: n }, (_, i) => `T${i}`);
    expect(truncateList(t(12))).toEqual({ shown: t(12), more: 0 });
    expect(truncateList(t(13)).shown).toHaveLength(10);
    expect(truncateList(t(24)).more).toBe(14);
    expect(tickerLine(t(3))).toBe('T0 T1 T2');
    expect(tickerLine(t(24))).toBe(`${t(10).join(' ')} +14 more`);
  });

  it('filters tickers by the letters typed', () => {
    const list = [{ ticker: 'ARCN' }, { ticker: 'BRLK' }, { ticker: 'CYRA' }];
    expect(filterByTicker(list, '').map((t) => t.ticker)).toEqual(['ARCN', 'BRLK', 'CYRA']);
    expect(filterByTicker(list, 'r').map((t) => t.ticker)).toEqual(['ARCN', 'BRLK', 'CYRA']);
    expect(filterByTicker(list, 'rc ').map((t) => t.ticker)).toEqual(['ARCN']);
    expect(filterByTicker(list, 'zz')).toEqual([]);
  });
});

describe('results pages', () => {
  it('balances pages and covers every firm once', () => {
    for (const n of COUNTS) {
      for (const max of [16, 24, 32]) {
        const pages = balancedPages(n, max);
        expect(pages[0]?.start).toBe(0);
        expect(pages[pages.length - 1]?.end).toBe(n);
        pages.forEach((p, i) => {
          expect(p.end - p.start).toBeLessThanOrEqual(max);
          if (i > 0) expect(p.start).toBe(pages[i - 1]?.end);
        });
        const sizes = pages.map((p) => p.end - p.start);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(pages.length);
      }
    }
    expect(balancedPages(50, 32).map((p) => p.end - p.start)).toEqual([25, 25]);
  });

  it('FINAL BOARD: one column to 16, two to 32, pages above', () => {
    expect(finalBoardPages(16)).toHaveLength(1);
    expect(resultColumns(16)).toBe(1);
    expect(resultColumns(17)).toBe(2);
    expect(finalBoardPages(32)).toHaveLength(1);
    expect(finalBoardPages(33)).toHaveLength(2);
    expect(finalBoardPages(50)).toHaveLength(2);
  });

  it('COUNTERFACTUAL splits above 16 firms', () => {
    expect(counterfactualPages(16).split).toBe(false);
    expect(counterfactualPages(17)).toEqual({ split: true, compare: [{ start: 0, end: 17 }] });
    expect(counterfactualPages(50).compare).toHaveLength(2);
  });

  it('counts pages per panel', () => {
    expect(resultPageCounts(8)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(resultPageCounts(16)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(resultPageCounts(24)).toEqual([1, 1, 2, 1, 1, 1]);
    expect(resultPageCounts(50)).toEqual([2, 1, 3, 1, 1, 1]);
  });

  it('steps through pages before panels, both ways', () => {
    const c = resultPageCounts(50);
    const seq: string[] = [];
    let pos: { step: number; sub: number } = { step: 0, sub: 0 };
    for (;;) {
      seq.push(resultsPositionLabel(c, pos.step, pos.sub));
      const next = stepResultsPosition(c, pos.step, pos.sub, 1);
      if (typeof next === 'string') {
        expect(next).toBe('This is the last results panel.');
        break;
      }
      pos = next;
    }
    expect(seq).toEqual(['1/6 · 1/2', '1/6 · 2/2', '2/6', '3/6 · 1/3', '3/6 · 2/3', '3/6 · 3/3', '4/6', '5/6', '6/6']);
    const back: string[] = [];
    for (;;) {
      const prev = stepResultsPosition(c, pos.step, pos.sub, -1);
      if (typeof prev === 'string') {
        expect(prev).toBe('This is the first results panel.');
        break;
      }
      pos = prev;
      back.push(resultsPositionLabel(c, pos.step, pos.sub));
    }
    expect(back).toEqual(seq.slice(0, -1).reverse());
  });

  it('keeps the six-step sequence for team-mode counts', () => {
    const c = resultPageCounts(12);
    expect(stepResultsPosition(c, 4, 0, 1)).toEqual({ step: 5, sub: 0 });
    expect(stepResultsPosition(c, 5, 0, 1)).toBe('This is the last results panel.');
    expect(resultsPositionLabel(c, 2, 0)).toBe('3/6');
  });
});
