import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { PARAMS, type Pact } from '../../src/engine';
import type { FirmNode, FirmPublicNode, PublicNode, RoundNode } from '../../src/firebase/schema';
import { boardChartW, boardColumns, boardMnemonics, boardTagW } from '../../src/screens/Screen/BoardView';
import { boardTagWidth, tagWidthCh } from '../../src/ui/layout';
import { INITIAL_VALUATION, boardRows, pactRows, type ScreenData } from '../../src/screens/Screen/model';

const firm = (ticker: string, createdAt: number): FirmNode => ({ name: `${ticker} Inc`, ticker, createdAt, order: 0, isBot: false, botPolicy: null });
const fp = (over: Partial<FirmPublicNode>): FirmPublicNode => ({
  share: 0.5, profit: 0, valuation: INITIAL_VALUATION, rank: 1, rankDelta: 0, submittedRound: 0, auto: false, insolvent: false, breachUntilRound: 0, ...over,
});
const pub = (over: Partial<PublicNode> = {}): PublicNode => ({
  phase: 'reveal', round: 2, deadline: null, paused: false, disclosure: false, T: 70, M: 500, collapsed: false, collapseRound: null,
  joinLocked: true, resolvingBy: null, endedAt: null, revealStep: 0, resumePhase: null, pausedRemainingMs: null, ...over,
});
const pact = (over: Partial<Pact> = {}): Pact => ({ id: 'p1', name: 'PACT-A', proposer: 'a', terms: { maxPace: 2, minSafety: 10 }, members: { a: 1, b: 1 }, createdRound: 1, status: 'active', ...over });
const roundNode = (over: Partial<RoundNode> = {}): RoundNode => ({ T: 70, dT: 0, M: 1, incidents: 0, incidentFirms: [], headlines: [], audits: [], disclosure: null, results: {}, ...over });

function data(over: Partial<ScreenData> = {}): ScreenData {
  return {
    pub: pub(),
    meta: { code: 'ABCD', title: 't', createdAt: 0, facilitatorUid: 'f', settings: { mode: 'team', timerSec: 120, autoResolve: false, revealThreshold: false, litRoom: false } },
    firms: { a: firm('AAA', 1), b: firm('BBB', 2) },
    firmsPublic: { a: fp({ rank: 1 }), b: fp({ rank: 2, breachUntilRound: 3 }) },
    rounds: { '1': roundNode(), '2': roundNode() },
    pacts: { p1: pact() },
    wire: {},
    memberCounts: {},
    ...over,
  };
}

const cellsOf = (d: ScreenData, disclosure: boolean, label: string): string[] => {
  const col = boardColumns(disclosure, false).find((c) => c.label === label);
  return boardRows(d).map((r, i) => (col ? renderToStaticMarkup(createElement('span', null, col.render(r, i))).replace(/<[^>]+>/g, '') : 'NO COLUMN'));
};

describe('disclosure columns on the board (spec §9.3)', () => {
  const snapshot = { a: { pace: 3, safety: 12, expo: PARAMS.DRAW[3], risk: null }, b: { pace: 1, safety: 25, expo: 0.1, risk: null } } as const;

  it('shows PACE, SAFETY and EXPOSURE only while disclosure is on', () => {
    const labels = (on: boolean) => boardColumns(on, false).map((c) => c.label);
    expect(labels(false)).not.toEqual(expect.arrayContaining(['PACE']));
    expect(labels(false).some((l) => l === 'SAFETY' || l === 'EXPOSURE')).toBe(false);
    expect(labels(true)).toEqual(expect.arrayContaining(['PACE', 'SAFETY', 'EXPOSURE']));
  });

  it('uses full-word headers where width allows (Session 12), with the Session 13 columns', () => {
    expect(boardColumns(false, false).map((c) => c.key)).toEqual(['rank', 'move', 'firm', 'share', 'profit', 'value', 'chg', 'cmt', 'bar', 'trend', 'tags']);
    expect(boardColumns(false, false).map((c) => c.label).slice(0, 8)).toEqual(['#', 'MOVE', 'FIRM', 'SHARE', 'PROFIT', 'VALUE', 'CHANGE', '✓']);
    expect(boardMnemonics(true, false)).toEqual([]);
  });

  it('gives the bar and trend line the widths in the §14.1 table', () => {
    const w = (disc: boolean, lit: boolean) => {
      const cols = boardColumns(disc, false, lit);
      return { bar: cols.find((c) => c.key === 'bar')?.w ?? 0, trend: cols.find((c) => c.key === 'trend')?.w ?? 0, tags: boardTagW(disc, lit) };
    };
    expect(w(false, false)).toEqual({ bar: 12, trend: 14, tags: 16 });
    expect(w(true, false)).toEqual({ bar: 6, trend: 0, tags: 15 });
    expect(w(false, true)).toEqual({ bar: 6, trend: 8, tags: 15 });
    expect(w(true, true)).toEqual({ bar: 0, trend: 0, tags: 13 });
    expect(boardChartW(true, true)).toEqual({ bar: 0, trend: 0 });
  });

  it('keeps SHARE and PROFIT, and the commit mark is a narrow column (owner decision 2026-10-05)', () => {
    for (const [disc, lit] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const cols = boardColumns(disc, false, lit);
      expect(cols.map((c) => c.label)).toEqual(expect.arrayContaining(['SHARE', 'PROFIT']));
      expect(cols.find((c) => c.key === 'cmt')?.w).toBe(2);
    }
  });

  it('a BREACH tag and a pact tag fit in every mode but lit-room with disclosure on', () => {
    for (const [disc, lit] of [[false, false], [true, false], [false, true]] as const) {
      expect(boardTagW(disc, lit)).toBeGreaterThanOrEqual(tagWidthCh('BREACH') + tagWidthCh('PACT-A'));
    }
  });

  it('with disclosure on, a BREACH tag and a pact tag still fit beside the full-word headers', () => {
    expect(boardTagW(true, false)).toBeGreaterThanOrEqual(tagWidthCh('BREACH') + tagWidthCh('PACT-A'));
  });

  it('falls back to keyed mnemonics in lit-room mode with disclosure on, keeping room for tags', () => {
    const labels = boardColumns(true, false, true).map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['SAFE', 'EXPO']));
    expect(boardMnemonics(true, true).map((m) => m.tag)).toEqual(['SAFE', 'EXPO']);
    expect(boardTagW(true, true)).toBeGreaterThanOrEqual(10);
    expect(boardMnemonics(false, true)).toEqual([]);
  });

  it('the tag width matches the columns built', () => {
    for (const [disc, lit] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const fixed = boardColumns(disc, false, lit).reduce((a, c) => a + c.w, 0);
      expect(boardTagW(disc, lit)).toBe(boardTagWidth(fixed, lit));
    }
  });

  it('fills them from the round snapshot', () => {
    const d = data({ pub: pub({ disclosure: true }), rounds: { '1': roundNode(), '2': roundNode({ disclosure: { ...snapshot } }) } });
    expect(cellsOf(d, true, 'PACE')).toEqual(['3', '1']);
    expect(cellsOf(d, true, 'SAFETY')).toEqual(['12', '25']);
    expect(cellsOf(d, true, 'EXPOSURE')[1]).toBe('0.1');
  });

  it('shows dashes until a snapshot has been published, and never reads one while the toggle is off', () => {
    expect(cellsOf(data({ pub: pub({ disclosure: true }) }), true, 'PACE')).toEqual(['–', '–']);
    const published = data({ pub: pub({ disclosure: false }), rounds: { '1': roundNode(), '2': roundNode({ disclosure: { ...snapshot } }) } });
    expect(boardRows(published).every((r) => r.disclosed === null)).toBe(true);
  });
});

describe('pact rows for the projector', () => {
  it('lists active pacts with member tickers and the BREACH flag', () => {
    const rows = pactRows(data());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'PACT-A', maxPace: 2, minSafety: 10, lastAudit: null });
    expect(rows[0]?.members).toEqual([{ id: 'a', ticker: 'AAA', breach: false }, { id: 'b', ticker: 'BBB', breach: true }]);
  });

  it('drops the BREACH flag two quarters after detection', () => {
    expect(pactRows(data({ pub: pub({ round: 4 }) }))[0]?.members.find((m) => m.id === 'b')?.breach).toBe(false);
  });

  it('reports the latest published audit, and omits dissolved pacts', () => {
    const audits = (n: number) => [{ pactId: 'p1', kind: 'auto' as const, rounds: [n], breaches: n === 2 ? [{ firmId: 'b', rounds: [2], count: 1, fine: 10, waived: false, expelled: false }] : [] }];
    const d = data({ rounds: { '1': roundNode({ audits: audits(1) }), '2': roundNode({ audits: audits(2) }) } });
    expect(pactRows(d)[0]?.lastAudit).toEqual({ round: 2, kind: 'auto', breaches: 1 });
    expect(pactRows(data({ pacts: { p1: pact({ status: 'dissolved' }) } }))).toEqual([]);
  });
});
