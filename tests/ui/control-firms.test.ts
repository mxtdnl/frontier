import { describe, expect, it } from 'vitest';
import { firmTable, type ConsoleFirm } from '../../src/screens/Control/firms';

const on = { online: true };
const off = { online: false };
const rows: ConsoleFirm[] = [
  { id: 'a', ticker: 'AAA', bot: null, members: [on, off], committed: true },
  { id: 'b', ticker: 'BBB', bot: null, members: [off], committed: false },
  { id: 'c', ticker: 'CCC', bot: 'greedy', members: [], committed: false },
  { id: 'd', ticker: 'DDD', bot: null, members: [], committed: false },
  { id: 'e', ticker: 'EEE', bot: null, members: [on, on, on], committed: false },
];
const ids = (r: ConsoleFirm[]) => r.map((f) => f.id).join('');
const none = { notCommitted: false, offline: false };

describe('console firms table (spec §14.2)', () => {
  it('keeps creation order by default', () => {
    expect(ids(firmTable(rows, 'order', none, true))).toBe('abcde');
  });

  it('sorts firms still to commit first, bots counting as committed', () => {
    expect(ids(firmTable(rows, 'cmt', none, true))).toBe('bdeac');
  });

  it('sorts by devices online, fewest first, bots last', () => {
    expect(ids(firmTable(rows, 'online', none, true))).toBe('bdaec');
  });

  it('filters to firms not committed, only while a quarter is open', () => {
    expect(ids(firmTable(rows, 'order', { notCommitted: true, offline: false }, true))).toBe('bde');
    expect(ids(firmTable(rows, 'order', { notCommitted: true, offline: false }, false))).toBe('abcde');
  });

  it('filters to human firms with no device online', () => {
    expect(ids(firmTable(rows, 'order', { notCommitted: false, offline: true }, true))).toBe('bd');
    expect(ids(firmTable(rows, 'cmt', { notCommitted: true, offline: true }, true))).toBe('bd');
  });
});
