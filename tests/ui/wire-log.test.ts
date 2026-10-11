/** Facilitator wire screen (spec §14.2, Session 18): grouping, the quarter range, "NOT ON THE WIRE" and the copy text. */
import { describe, expect, it } from 'vitest';
import { PARAMS, resolveRound, type EngineState, type Params } from '../../src/engine';
import type { RoundNode, WireNode } from '../../src/firebase/schema';
import { copyText, notOnWire, quarterRange, wireGroups } from '../../src/screens/Wire/model';
import { all, dec, game } from '../engine/helpers';

const round = (headlines: RoundNode['headlines'], resolvedAt: number | null = 5000): RoundNode => ({
  T: 60, dT: 0, M: 1, incidents: 0, incidentFirms: [], headlines, audits: [], disclosure: null, results: {}, resolvedAt,
});
const live = (round_: number, seq: number, at: number, text: string, kind: WireNode['kind'] = 'pact-joined'): WireNode => ({
  at, round: round_, seq, kind, text, pact: null, firm: null, joined: null,
});

describe('wireGroups', () => {
  const rounds = {
    '1': round([{ kind: 'incident', text: 'Service outage traced to HUMN model' }, { kind: 'ambient', text: 'Analysts revise forecasts' }], 1000),
    '2': round([{ kind: 'audit-clean', text: 'Audit of PACT-A finds full compliance' }], null),
  };
  const wire = {
    a: live(0, -0.5, 10, 'HUMN joins PACT-A'),
    b: live(1, 0.5, 900, 'Assembly passes frontier disclosure rule', 'disclosure-on'),
    c: live(1, 1, 1100, 'BTC withdraws from PACT-A', 'pact-left'),
    d: live(2, 1.5, 1500, 'ARCN joins PACT-A'),
  };

  it('groups by quarter, newest first, with entries before quarter 1 under PRE (0)', () => {
    const g = wireGroups(rounds, wire);
    expect(g.map((x) => x.round)).toEqual([2, 1, 0]);
    expect(g[2]?.lines.map((l) => l.text)).toEqual(['HUMN joins PACT-A']);
  });

  it('orders a quarter as it happened: open-phase events, the headlines, then reveal events', () => {
    const q1 = wireGroups(rounds, wire).find((x) => x.round === 1);
    expect(q1?.lines.map((l) => l.text)).toEqual([
      'Assembly passes frontier disclosure rule',
      'Service outage traced to HUMN model',
      'Analysts revise forecasts',
      'BTC withdraws from PACT-A',
    ]);
    expect(q1?.lines.map((l) => l.at)).toEqual([900, 1000, 1000, 1100]);
  });

  it('labels and colours each line by kind, as the ticker does', () => {
    const q1 = wireGroups(rounds, wire).find((x) => x.round === 1);
    expect(q1?.lines.map((l) => [l.kind, l.tone])).toEqual([['DISCL', 'wire'], ['INCID', 'down'], ['NEWS', 'wire'], ['PACT', 'wire']]);
    const q2 = wireGroups(rounds, wire).find((x) => x.round === 2);
    expect(q2?.lines.map((l) => [l.kind, l.tone, l.at])).toEqual([['PACT', 'wire', 1500], ['AUDIT', 'up', null]]);
  });

  it('is empty for an empty session', () => {
    expect(wireGroups({}, {})).toEqual([]);
  });

  it('keeps every entry of a 30-quarter session', () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [String(i + 1), round([{ kind: 'ambient', text: `a${i}` }, { kind: 'rank', text: `b${i}` }])]));
    const events = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, live(Math.floor(i / 2), Math.floor(i / 2) - 0.5, i, `e${i}`)]));
    const g = wireGroups(many, events);
    expect(g.reduce((n, x) => n + x.lines.length, 0)).toBe(120);
    expect(g[0]?.round).toBe(30);
  });
});

describe('quarterRange', () => {
  it('runs from PRE to the current quarter, every earlier quarter included', () => {
    expect(quarterRange([], 0)).toEqual([0]);
    expect(quarterRange([{ round: 2, lines: [] }], 4)).toEqual([0, 1, 2, 3, 4]);
    expect(quarterRange([{ round: 5, lines: [] }], 3)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('notOnWire', () => {
  const tickers = (s: EngineState): Record<string, string> => Object.fromEntries(s.firms.map((f) => [f.id, f.ticker]));

  it('lists the incidents and cards the headline cap left out, and nothing that was headlined', () => {
    const always: Params = { ...PARAMS, INC_BASE: [1, 1, 1, 1], SAFETY_INC_EFF: 0 };
    const g = game(10);
    const r = resolveRound(g, all(g, dec(2, 10, 'BLITZ')), always);
    const rec = r.state.history[0]!;
    const off = notOnWire(r.state.history, 1, tickers(r.state), {});
    const t = tickers(r.state);
    for (const id of rec.incidentFirms) {
      const headlined = rec.headlines.some((h) => h.kind === 'incident' && h.text.includes(t[id]!));
      const listed = off.some((l) => l.kind === 'INCID' && l.text.startsWith(`${t[id]} had an incident`));
      expect(headlined !== listed, t[id]).toBe(true);
    }
    // At most 4 headlines, so most of the 10 incidents and 10 BLITZ cards are off the wire.
    expect(off.filter((l) => l.kind === 'INCID').length).toBeGreaterThanOrEqual(6);
    expect(off.filter((l) => l.kind === 'BLITZ')).toHaveLength(10);
    expect(off.find((l) => l.kind === 'INCID')?.text).toMatch(/· pace 2 · safety 10%$/);
    expect(off.every((l) => l.round === 1)).toBe(true);
  });

  it('names the POACH target, audits and insolvencies', () => {
    const p: Params = { ...PARAMS, INC_BASE: [0, 0, 0, 0] };
    const g = game(6, { settings: { autoAuditP: 0 } });
    g.firms[1]!.cash = -99;
    const r = resolveRound(g, { f0: dec(2, 10, 'POACH', 'f1'), f1: dec(4, 30) }, p);
    const t = tickers(r.state);
    const off = notOnWire(r.state.history, 1, t, {});
    const rec = r.state.history[0]!;
    const poachHeadlined = rec.headlines.some((h) => h.kind === 'poach');
    expect(off.some((l) => l.text === `${t.f0} played POACH on ${t.f1}`)).toBe(!poachHeadlined);
    const insolvHeadlined = rec.headlines.some((h) => h.kind === 'insolvency');
    expect(rec.firms.f1?.insolvent).toBe(true);
    expect(off.some((l) => l.kind === 'INSOLV' && l.text === `${t.f1} became insolvent`)).toBe(!insolvHeadlined);
  });

  it('reports an audit the cap dropped, and nothing for a quarter not in the history', () => {
    const g = game(4);
    const r = resolveRound(g, {}, PARAMS);
    const h = structuredClone(r.state.history);
    h[0]!.headlines = [];
    h[0]!.audits = [{ pactId: 'p1', kind: 'manual', rounds: [1], breaches: [{ firmId: 'f2', rounds: [1], count: 1, fine: 10, waived: false, expelled: false }] }];
    h[0]!.firms.f3!.card = 'SHARE';
    const off = notOnWire(h, 1, tickers(r.state), { p1: 'PACT-A' });
    expect(off.map((l) => l.text)).toContain('manual audit of PACT-A: CYRA breached · fine 10.0');
    expect(off.map((l) => l.text)).toContain('DOLM played SHARE');
    expect(notOnWire(h, 7, tickers(r.state), {})).toEqual([]);
  });
});

describe('copyText', () => {
  const rounds = { '1': round([{ kind: 'incident', text: 'Service outage traced to HUMN model' }], 1000) };
  const wire = { a: live(0, -0.5, 10, 'HUMN joins PACT-A') };
  const groups = wireGroups(rounds, wire);
  const off = (r: number) => (r === 1 ? [{ round: 1, kind: 'BLITZ', text: 'BTC played BLITZ', tone: 'wire' as const }] : []);
  const time = (at: number) => `T${at}`;

  it('copies one quarter with its NOT ON THE WIRE section', () => {
    expect(copyText(1, groups, off, time, 'Class A · code ABCD', 1)).toBe(
      ['FRONTIER WIRE · Class A · code ABCD · Q1 Y1', '', 'Q1 Y1', 'Q1 Y1  T1000  INCID    Service outage traced to HUMN model', 'NOT ON THE WIRE', 'Q1 Y1  BLITZ    BTC played BLITZ'].join('\n'),
    );
  });

  it('copies every quarter, newest first, and PRE without a facilitator section', () => {
    const text = copyText('all', groups, off, time, 'x', 1);
    expect(text.split('\n')[0]).toBe('FRONTIER WIRE · x · ALL QUARTERS');
    expect(text.indexOf('Q1 Y1')).toBeLessThan(text.indexOf('\nPRE'));
    expect(text).toContain('PRE  T10  PACT     HUMN joins PACT-A');
    expect(text.match(/NOT ON THE WIRE/g)).toHaveLength(1);
  });

  it('says so for a quarter without entries', () => {
    expect(copyText(3, groups, () => [], time, 'x', 3)).toContain('Q3 Y1\nNo wire entries.\nNOT ON THE WIRE\nNothing left out.');
  });

  it('has no NOT ON THE WIRE section for a quarter not yet resolved', () => {
    expect(copyText(2, groups, off, time, 'x', 1)).not.toContain('NOT ON THE WIRE');
  });
});
