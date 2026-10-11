/** Incidents on the projector (spec §14.1, §15.4, Session 18): the line builder, the block cap, the tag and the INCID view. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BANK, PARAMS } from '../../src/engine';
import type { FirmNode, FirmPublicNode, PublicNode, RoundNode } from '../../src/firebase/schema';
import { IncidentBlock, boardTags } from '../../src/screens/Screen/BoardView';
import { boardRows, tagKey, type ScreenData } from '../../src/screens/Screen/model';
import { IncidentsView } from '../../src/screens/Screen/Views';
import { parseCommand } from '../../src/ui/commands';
import {
  GENERAL_CAUSE,
  INCIDENT_BLOCK_MAX,
  allIncidents,
  incidentBlock,
  incidentCap,
  incidentLines,
  incidentTagged,
  incidentTrustCost,
} from '../../src/ui/incidents';

const firm = (ticker: string, createdAt: number): FirmNode => ({ name: `${ticker} Inc`, ticker, createdAt, order: 0, isBot: false, botPolicy: null });
const TICKERS = ['ARC', 'ARCN', 'BTC', 'HUMN', 'LUMA', 'MIRA', 'NOVA', 'ORCA', 'PIKE', 'KELP'];
const FIRMS: Record<string, FirmNode> = Object.fromEntries(TICKERS.map((t, i) => [`f${i}`, firm(t, i)]));
const results = (n: number): RoundNode['results'] =>
  Object.fromEntries(TICKERS.slice(0, n).map((_, i) => [`f${i}`, { share: 1 / n, profit: 0, valuation: 100, rank: i + 1 }]));
const node = (over: Partial<RoundNode> = {}): RoundNode => ({
  T: 60, dT: -4, M: 500, incidents: 0, incidentFirms: [], resolvedAt: null, headlines: [], audits: [], disclosure: null, results: results(10), ...over,
});
const text = (el: ReturnType<typeof createElement>): string => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ');

describe('incidentLines', () => {
  it('is empty with no incidents and for a missing quarter', () => {
    expect(incidentLines(3, node(), FIRMS)).toEqual([]);
    expect(incidentLines(3, undefined, FIRMS)).toEqual([]);
  });

  it('names each firm with its headline and effect, in incident order', () => {
    const r = node({
      incidents: 2,
      incidentFirms: ['f2', 'f3'],
      headlines: [
        { kind: 'incident', text: 'Data leak hits HUMN enterprise clients' },
        { kind: 'incident', text: 'Service outage traced to BTC model' },
      ],
    });
    const lines = incidentLines(5, r, FIRMS);
    expect(lines.map((l) => l.ticker)).toEqual(['BTC', 'HUMN']);
    expect(lines[0]?.headline).toBe('Service outage traced to BTC model');
    expect(lines[1]?.headline).toBe('Data leak hits HUMN enterprise clients');
    // 10 firms: INC_TRUST × 8/10.
    expect(lines[0]?.effect).toBe(`trust −${(PARAMS.INC_TRUST * 0.8).toFixed(1)} · BTC revenue −15% this quarter`);
    expect(lines.every((l) => l.round === 5)).toBe(true);
  });

  it('scales the trust cost with the firm count of that quarter', () => {
    expect(incidentTrustCost(8)).toBeCloseTo(PARAMS.INC_TRUST, 12);
    expect(incidentTrustCost(50)).toBeCloseTo((PARAMS.INC_TRUST * 8) / 50, 12);
    const four = incidentLines(1, node({ incidents: 1, incidentFirms: ['f0'], results: results(4) }), FIRMS);
    expect(four[0]?.effect).toContain(`trust −${(PARAMS.INC_TRUST * 2).toFixed(1)}`);
  });

  it('uses the first incident template when the headline cap left the incident out', () => {
    const lines = incidentLines(2, node({ incidents: 1, incidentFirms: ['f4'], headlines: [{ kind: 'collapse', text: 'x' }] }), FIRMS);
    expect(lines[0]?.headline).toBe((BANK.incident[0] ?? '').replace('{FIRM}', 'LUMA'));
  });

  it('matches a ticker as a whole word, so ARC never takes the ARCN headline', () => {
    const r = node({ incidents: 2, incidentFirms: ['f0', 'f1'], headlines: [{ kind: 'incident', text: 'ARCN model linked to fraud wave' }] });
    const [arc, arcn] = incidentLines(2, r, FIRMS);
    expect(arcn?.headline).toBe('ARCN model linked to fraud wave');
    expect(arc?.headline).toBe((BANK.incident[0] ?? '').replace('{FIRM}', 'ARC'));
  });

  it('with disclosure on, gives pace, safety and the stored incident risk', () => {
    const r = node({
      incidents: 1,
      incidentFirms: ['f3'],
      disclosure: { f3: { pace: 4, safety: 5, expo: 8.1, risk: 0.2675 }, f2: { pace: 2, safety: 15, expo: 2, risk: null } },
    });
    const [l] = incidentLines(4, r, FIRMS);
    expect(l?.cause).toBe('pace 4 · safety 5% · incident risk 27%');
    expect(l?.disclosed).toBe(true);
  });

  it('with disclosure off, gives only the general cause: no pace, safety or risk', () => {
    const r = node({ incidents: 2, incidentFirms: ['f3', 'f5'] });
    for (const l of incidentLines(4, r, FIRMS)) {
      expect(l.cause).toBe(GENERAL_CAUSE);
      expect(l.disclosed).toBe(false);
      expect(`${l.headline} ${l.effect} ${l.cause}`).not.toMatch(/pace \d|safety \d|risk \d/);
    }
  });

  it('skips a firm id that is not in the firm list', () => {
    expect(incidentLines(1, node({ incidents: 1, incidentFirms: ['gone'] }), FIRMS)).toEqual([]);
  });
});

describe('the INCIDENTS block', () => {
  const eight = node({ incidents: 8, incidentFirms: ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'] });

  it('shows at most 4 incidents, then counts the rest', () => {
    const lines = incidentLines(3, eight, FIRMS);
    expect(incidentBlock(lines)).toMatchObject({ more: 4 });
    expect(incidentBlock(lines).shown).toHaveLength(INCIDENT_BLOCK_MAX);
    expect(incidentBlock(lines.slice(0, 4)).more).toBe(0);
    expect(incidentBlock(lines.slice(0, 1)).shown).toHaveLength(1);
  });

  it('keeps 3 in lit-room mode with disclosure on, 4 otherwise', () => {
    expect(incidentCap(false, false)).toBe(4);
    expect(incidentCap(false, true)).toBe(4);
    expect(incidentCap(true, false)).toBe(4);
    expect(incidentCap(true, true)).toBe(3);
  });

  it('renders "+N more · INCID for the full list" and the general cause once', () => {
    const out = text(createElement(IncidentBlock, { round: 3, lines: incidentLines(3, eight, FIRMS), max: 4 }));
    expect(out).toContain('+4 more · INCID for the full list');
    expect(out.split(GENERAL_CAUSE)).toHaveLength(2);
    expect(out).toContain('INCIDENTS');
    expect(out).toContain('▼ ARC');
  });

  it('renders each cause with disclosure on and no general cause', () => {
    const r = node({ incidents: 1, incidentFirms: ['f3'], disclosure: { f3: { pace: 3, safety: 10, expo: 4, risk: 0.1 } } });
    const out = text(createElement(IncidentBlock, { round: 3, lines: incidentLines(3, r, FIRMS), max: 4 }));
    expect(out).toContain('pace 3 · safety 10% · incident risk 10%');
    expect(out).not.toContain(GENERAL_CAUSE);
    expect(out).not.toContain('more');
  });
});

describe('INCID tag', () => {
  const r = node({ incidents: 1, incidentFirms: ['f1'] });

  it('marks the firm during the reveal and the next open quarter only', () => {
    expect(incidentTagged(4, r, 4, 'reveal').has('f1')).toBe(true);
    expect(incidentTagged(4, r, 4, 'summit').has('f1')).toBe(true);
    expect(incidentTagged(4, r, 5, 'open').has('f1')).toBe(true);
    expect(incidentTagged(4, r, 5, 'resolving').size).toBe(0);
    expect(incidentTagged(4, r, 6, 'open').size).toBe(0);
    expect(incidentTagged(0, undefined, 1, 'open').size).toBe(0);
  });

  it('sits after BREACH and before INSOLV, and has a key entry', () => {
    const pub: PublicNode = {
      phase: 'reveal', round: 2, deadline: null, paused: false, disclosure: false, T: 70, M: 500, collapsed: false, collapseRound: null,
      joinLocked: true, resolvingBy: null, endedAt: null, revealStep: 0, resumePhase: null, pausedRemainingMs: null,
    };
    const fp = (over: Partial<FirmPublicNode>): FirmPublicNode => ({
      share: 0.5, profit: 0, valuation: 100, rank: 1, rankDelta: 0, submittedRound: 0, auto: false, insolvent: false, breachUntilRound: 0, ...over,
    });
    const d: ScreenData = {
      pub,
      meta: { code: 'ABCD', title: 't', createdAt: 0, facilitatorUid: 'f', settings: { mode: 'team', timerSec: 120, autoResolve: false, revealThreshold: false, litRoom: false } },
      firms: { a: firm('AAA', 1), b: firm('BBB', 2) },
      firmsPublic: { a: fp({ rank: 1, insolvent: true, breachUntilRound: 3 }), b: fp({ rank: 2 }) },
      rounds: { '1': node({ results: {} }), '2': node({ results: {}, incidents: 1, incidentFirms: ['a'] }) },
      pacts: {},
      wire: {},
      memberCounts: {},
    };
    const rows = boardRows(d);
    expect(boardTags(rows[0]!)).toEqual(['BREACH', 'INCID', 'INSOLV']);
    expect(boardTags(rows[1]!)).toEqual([]);
    expect(tagKey([boardTags(rows[0]!)], false).map((k) => k.tag)).toEqual(['BREACH', 'INCID', 'INSOLV']);
  });
});

describe('INCID view', () => {
  it('parses as a command', () => {
    expect(parseCommand('incid')).toEqual({ kind: 'incid' });
    expect(parseCommand('INCID <GO>')).toEqual({ kind: 'incid' });
  });

  it('lists every incident of the session, newest quarter first, with the three parts', () => {
    const rounds = {
      '1': node({ incidents: 1, incidentFirms: ['f2'] }),
      '2': node(),
      '3': node({ incidents: 2, incidentFirms: ['f0', 'f3'], disclosure: { f0: { pace: 4, safety: 0, expo: 9, risk: 0.3 }, f3: { pace: 3, safety: 5, expo: 5, risk: 0.13 } } }),
    };
    const all = allIncidents(rounds, FIRMS);
    expect(all.map((l) => [l.round, l.ticker])).toEqual([[3, 'ARC'], [3, 'HUMN'], [1, 'BTC']]);
    const d = { rounds, firms: FIRMS } as unknown as ScreenData;
    const out = text(createElement(IncidentsView, { data: d }));
    expect(out).toContain('Q3 Y1');
    expect(out).toContain('Q1 Y1');
    expect(out).toContain('pace 4 · safety 0% · incident risk 30%');
    expect(out).toContain(GENERAL_CAUSE);
    expect(out).toContain('3 in total');
  });

  it('says so when there are no incidents', () => {
    const d = { rounds: { '1': node() }, firms: FIRMS } as unknown as ScreenData;
    expect(text(createElement(IncidentsView, { data: d }))).toContain('No incidents yet.');
  });
});
