import { describe, expect, it } from 'vitest';
import {
  boardCapacity,
  boardTagWidth,
  fitTags,
  tagWidthCh,
  boardMode,
  boardPage,
  boardPageCount,
  fillColumns,
  filterByTicker,
  lobbyColumns,
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

describe('board capacity (two-line rows that fit the grid)', () => {
  it('is 12 as standard, 11 under the summit banner, 10 in lit-room mode and 9 in both', () => {
    expect(boardCapacity()).toBe(12);
    expect(boardCapacity({ banner: true })).toBe(11);
    expect(boardCapacity({ lit: true })).toBe(10);
    expect(boardCapacity({ lit: true, banner: true })).toBe(9);
  });

  it('switches to one-line rows sooner when fewer two-line rows fit', () => {
    expect(boardMode(12, boardCapacity({ banner: true }))).toBe('compact');
    expect(boardMode(11, boardCapacity({ banner: true }))).toBe('tall');
    expect(boardMode(10, boardCapacity({ lit: true }))).toBe('tall');
    expect(boardMode(16, boardCapacity({ lit: true, banner: true }))).toBe('compact');
  });

  it('never shows more two-line rows than fit, in any mode', () => {
    for (const opts of [{}, { banner: true }, { lit: true }, { lit: true, banner: true }]) {
      const cap = boardCapacity(opts);
      for (const n of COUNTS.filter((c) => c > 16)) {
        const rows = ranked(n, { [n]: -10, [Math.ceil(n / 2)]: 6, 15: 4 });
        for (let i = 0; i < boardPageCount(n, cap); i++) {
          const p = boardPage(rows, i, cap);
          expect(p.rows.length + p.pinned.length).toBeLessThanOrEqual(cap);
        }
      }
    }
    expect(boardPageCount(50, boardCapacity({ lit: true, banner: true }))).toBe(6);
    expect(boardPage(ranked(50), 3, boardCapacity({ banner: true })).pinned.map((r) => r.id)).toEqual(['f1']);
    expect(boardPage(ranked(50), 3, boardCapacity({ lit: true })).pinned).toEqual([]);
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

describe('board tags on one line', () => {
  it('keeps every tag when they fit', () => {
    expect(fitTags(['BOT', 'PACT-A'], 30)).toEqual({ shown: ['BOT', 'PACT-A'], more: 0 });
    expect(fitTags([], 5)).toEqual({ shown: [], more: 0 });
  });

  it('keeps the most important tags and counts the rest, never exceeding the width', () => {
    const tags = ['BREACH', 'AUTO', 'PACT-A', 'PACT-B'];
    for (const w of [8, 12, 16, 20, 26, 40]) {
      const r = fitTags(tags, w);
      expect(r.shown).toEqual(tags.slice(0, r.shown.length));
      expect(r.shown.length + r.more).toBe(tags.length);
      const used = r.shown.reduce((a, t) => a + tagWidthCh(t), 0) + (r.more > 0 ? `+${r.more}`.length + 1 : 0);
      expect(used).toBeLessThanOrEqual(w);
    }
    expect(fitTags(tags, 12).shown).toEqual(['BREACH']);
  });

  it('leaves the tag column 25 ch as standard with disclosure, 12 ch in lit-room mode', () => {
    expect(boardTagWidth(65, false)).toBe(25);
    expect(boardTagWidth(65, true)).toBe(12);
  });
});
