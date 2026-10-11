import { describe, expect, it } from 'vitest';
import { fineFor, nextPactName, PACT_QUARTER, pactQuarters, PARAMS, resolveRound, type EngineState, type Pact, type PactTerms } from '../../src/engine';
import { dec, firm, game, NO_INC } from './helpers';

const p = PARAMS;

function addPact(s: EngineState, members: string[], terms: PactTerms, opts: { id?: string; createdRound?: number; joined?: number } = {}): Pact {
  const pact: Pact = {
    id: opts.id ?? 'p1',
    name: nextPactName(s.pacts),
    proposer: members[0] ?? 'f0',
    terms,
    members: Object.fromEntries(members.map((m) => [m, opts.joined ?? opts.createdRound ?? 1])),
    createdRound: opts.createdRound ?? 1,
    status: 'active',
  };
  s.pacts.push(pact);
  return pact;
}

const CAP2 = { maxPace: 2 as const, minSafety: null };

describe('compliance', () => {
  it('records breaches privately for members only', () => {
    const g = game(4);
    addPact(g, ['f0', 'f1'], { maxPace: 2, minSafety: 10 });
    const r = resolveRound(g, { f0: dec(3, 10), f1: dec(2, 9), f2: dec(4, 0) }, NO_INC);
    expect(r.state.pactsPrivate.p1?.violations['1']).toEqual({ f0: true, f1: true });
    expect(r.outputs.audits).toEqual([]);
  });

  it('checks a member from the round it joined', () => {
    const g = game(3);
    addPact(g, ['f0', 'f1'], CAP2, { joined: 2 });
    const r1 = resolveRound(g, { f0: dec(4, 0) }, NO_INC);
    expect(r1.state.pactsPrivate.p1?.violations['1']).toBeUndefined();
    const r2 = resolveRound(r1.state, { f0: dec(4, 0) }, NO_INC);
    expect(r2.state.pactsPrivate.p1?.violations['2']).toEqual({ f0: true });
  });

  it('checks the applied pace of an insolvent firm', () => {
    const g = game(3);
    firm(g, 'f0').insolvent = true;
    addPact(g, ['f0', 'f1'], CAP2);
    const r = resolveRound(g, { f0: dec(4, 0) }, NO_INC);
    expect(r.state.pactsPrivate.p1?.violations['1']).toBeUndefined();
  });
});

describe('audits and graduated sanctions', () => {
  it('fines 10%, 25%, then 40% and expels on the third detected violation', () => {
    let s = game(3);
    addPact(s, ['f0', 'f1'], CAP2);
    const fines: number[] = [];
    for (let i = 0; i < 3; i++) {
      s.pendingAudits = ['p1'];
      const r = resolveRound(s, { f0: dec(4, 0) }, NO_INC);
      const a = r.outputs.audits[0]!;
      expect(a.kind).toBe('manual');
      const b = a.breaches[0]!;
      expect(b).toMatchObject({ firmId: 'f0', count: i + 1, waived: false, expelled: i === 2 });
      const before = r.outputs.firms.f0!.cash + b.fine;
      expect(b.fine).toBeCloseTo(Math.max(p.FINE_MIN, p.FINE_RATES[i]! * before), 9);
      expect(r.outputs.firms.f0?.fine).toBeCloseTo(b.fine, 9);
      expect(firm(r.state, 'f0').breachUntilRound).toBe(r.outputs.round + p.BREACH_FLAG_ROUNDS - 1);
      fines.push(b.fine);
      s = r.state;
    }
    expect(s.pacts[0]?.members.f0).toBeUndefined();
    expect(s.pactsPrivate.p1?.sanctions.f0).toBe(3);
    expect(s.history[2]?.headlines.some((h) => h.text.includes('expelled'))).toBe(true);
  });

  it('LOBBY in the quarter of detection waives the fine but not publication', () => {
    const g = game(3);
    addPact(g, ['f0', 'f1'], CAP2);
    g.pendingAudits = ['p1'];
    const r = resolveRound(g, { f0: dec(4, 0, 'LOBBY') }, NO_INC);
    const b = r.outputs.audits[0]!.breaches[0]!;
    expect(b).toMatchObject({ firmId: 'f0', fine: 0, waived: true, count: 1 });
    expect(r.outputs.headlines.some((h) => h.kind === 'breach' && h.text.includes('ARCN'))).toBe(true);
  });

  it('examines unaudited rounds, at most the last AUDIT_WINDOW', () => {
    let s = game(3);
    addPact(s, ['f0', 'f1'], CAP2);
    for (let i = 0; i < 4; i++) s = resolveRound(s, { f0: dec(4, 0) }, NO_INC).state;
    s.pendingAudits = ['p1'];
    const r5 = resolveRound(s, { f0: dec(4, 0) }, NO_INC);
    expect(r5.outputs.audits[0]?.rounds).toEqual([3, 4, 5]);
    expect(r5.outputs.audits[0]?.breaches[0]?.rounds).toEqual([3, 4, 5]);
    expect(r5.state.pactsPrivate.p1?.detected['1']).toBeUndefined();
    expect(r5.state.pactsPrivate.p1?.detected['3']).toEqual({ f0: true });
    r5.state.pendingAudits = ['p1'];
    const r6 = resolveRound(r5.state, { f0: dec(1, 0) }, NO_INC);
    expect(r6.outputs.audits[0]?.rounds).toEqual([6]);
    expect(r6.outputs.audits[0]?.breaches).toEqual([]);
    expect(r6.outputs.headlines.some((h) => h.kind === 'audit-clean')).toBe(true);
  });

  it('audits automatically with probability autoAuditP from the audit stream', () => {
    const on = game(3, { settings: { autoAuditP: 1 } });
    addPact(on, ['f0', 'f1'], CAP2);
    expect(resolveRound(on, {}, NO_INC).outputs.audits[0]?.kind).toBe('auto');
    const off = game(3, { settings: { autoAuditP: 0 } });
    addPact(off, ['f0', 'f1'], CAP2);
    expect(resolveRound(off, {}, NO_INC).outputs.audits).toEqual([]);
    let hits = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const g = game(3, { seed, settings: { autoAuditP: 0.25 } });
      addPact(g, ['f0', 'f1'], CAP2);
      hits += resolveRound(g, {}, NO_INC).outputs.audits.length;
    }
    expect(hits / 400).toBeGreaterThan(0.18);
    expect(hits / 400).toBeLessThan(0.32);
  });

  it('fine has a floor of FINE_MIN, including at zero or negative cash', () => {
    expect(fineFor(1, 20, p)).toBe(p.FINE_MIN);
    expect(fineFor(1, -300, p)).toBe(p.FINE_MIN);
    expect(fineFor(2, 1000, p)).toBeCloseTo(p.FINE_RATES[1] * 1000, 9);
    expect(fineFor(5, 1000, p)).toBeCloseTo(p.FINE_RATES[2] * 1000, 9);
  });
});

describe('dissolution', () => {
  it('dissolves a pact with fewer than 2 members after 2 rounds', () => {
    const g = game(3);
    addPact(g, ['f0'], CAP2);
    const r1 = resolveRound(g, {}, NO_INC);
    expect(r1.state.pacts[0]?.status).toBe('active');
    const r2 = resolveRound(r1.state, {}, NO_INC);
    expect(r2.state.pacts[0]?.status).toBe('dissolved');
    r2.state.pendingAudits = ['p1'];
    expect(resolveRound(r2.state, {}, NO_INC).outputs.audits).toEqual([]);
  });

  it('keeps a pact with 2 members', () => {
    let s = game(3);
    addPact(s, ['f0', 'f1'], CAP2);
    for (let i = 0; i < 4; i++) s = resolveRound(s, {}, NO_INC).state;
    expect(s.pacts[0]?.status).toBe('active');
  });
});

describe('checked members and the quarter record (§9.2, §14.4)', () => {
  const { none, kept, detected, undetected } = PACT_QUARTER;

  it('notes every member checked, breach or not, and no one else', () => {
    const g = game(4);
    addPact(g, ['f0', 'f1'], CAP2);
    const r = resolveRound(g, { f0: dec(3, 10), f1: dec(2, 9), f2: dec(4, 0) }, NO_INC);
    expect(r.state.pactsPrivate.p1?.checked['1']).toEqual({ f0: true, f1: true });
  });

  it('is blank before a firm joins and after it leaves', () => {
    let s = game(3);
    addPact(s, ['f0', 'f1'], CAP2);
    s = resolveRound(s, { f0: dec(4, 0), f1: dec(2, 15), f2: dec(4, 0) }, NO_INC).state;
    s.pacts[0]!.members.f2 = 2;
    s = resolveRound(s, { f0: dec(2, 15), f1: dec(2, 15), f2: dec(4, 0) }, NO_INC).state;
    delete s.pacts[0]!.members.f0;
    s = resolveRound(s, { f0: dec(4, 0), f1: dec(2, 15), f2: dec(2, 15) }, NO_INC).state;
    expect(pactQuarters(s, s.pactsPrivate.p1)).toEqual({
      f0: undetected + kept + none,
      f1: kept + kept + kept,
      f2: none + undetected + kept,
    });
  });

  it('marks detected breaches, and is blank after a firm is expelled', () => {
    let s = game(3);
    addPact(s, ['f0', 'f1'], CAP2);
    for (let i = 0; i < 3; i++) {
      s.pendingAudits = ['p1'];
      s = resolveRound(s, { f0: dec(4, 0) }, NO_INC).state;
    }
    s = resolveRound(s, { f0: dec(4, 0) }, NO_INC).state;
    expect(s.pacts[0]?.members.f0).toBeUndefined();
    // With one member left the pact dissolved at the end of quarter 3, so quarter 4 is blank for f1 too.
    expect(s.pacts[0]?.status).toBe('dissolved');
    expect(pactQuarters(s, s.pactsPrivate.p1)).toEqual({ f0: detected.repeat(3) + none, f1: kept.repeat(3) + none });
  });

  it('is blank after the pact dissolves', () => {
    let s = game(3);
    addPact(s, ['f0'], CAP2);
    for (let i = 0; i < 3; i++) s = resolveRound(s, { f0: dec(4, 0) }, NO_INC).state;
    expect(s.pacts[0]?.status).toBe('dissolved');
    expect(pactQuarters(s, s.pactsPrivate.p1)).toEqual({ f0: undetected + undetected + none });
  });

  it('shows breaches only for a record written before checked members were noted', () => {
    const s = game(3);
    s.round = 3;
    const pp = { violations: { 2: { f1: true as const } }, detected: { 2: { f1: true as const } }, checked: {}, sanctions: {}, lastAuditRound: 2 };
    expect(pactQuarters(s, pp)).toEqual({ f1: none + detected + none });
    expect(pactQuarters(s, undefined)).toEqual({});
  });
});

describe('disclosure snapshot', () => {
  it('publishes pace, safety and d_i only while disclosure is on', () => {
    const on = resolveRound(game(3, { settings: { disclosure: true } }), { f0: dec(3, 5) }, NO_INC).outputs;
    expect(on.disclosure?.f0).toEqual({ pace: 3, safety: 5, expo: on.firms.f0!.expo, risk: null });
    expect(Object.keys(on.disclosure ?? {})).toHaveLength(3);
    const off = resolveRound(game(3), { f0: dec(3, 5) }, NO_INC).outputs;
    expect(off.disclosure).toBeNull();
    expect(off.firms.f0).toMatchObject({ pace: 3, safety: 5 });
  });

  it('stores the incident risk for incident firms only, cards included (Session 18)', () => {
    // f0 and f1 always have an incident (q ≥ any draw), f2 never does.
    const p = { ...PARAMS, INC_BASE: [0, 0, 1, 2] as const };
    const r = resolveRound(game(3, { settings: { disclosure: true } }), { f0: dec(4, 0, 'RUSH'), f1: dec(3, 0, 'PUBLISH'), f2: dec(1, 30) }, p).outputs;
    expect(r.incidentFirms).toEqual(['f0', 'f1']);
    expect(r.disclosure?.f0?.risk).toBeCloseTo(2 * PARAMS.RUSH_INC_MULT, 12);
    expect(r.disclosure?.f1?.risk).toBeCloseTo(1 * PARAMS.PUBLISH_INC_MULT, 12);
    expect(r.disclosure?.f2?.risk).toBeNull();
  });
});

describe('nextPactName', () => {
  it('runs PACT-A to PACT-Z, then PACT-AA', () => {
    const names = (n: number) => nextPactName(Array.from({ length: n }) as Pact[]);
    expect(names(0)).toBe('PACT-A');
    expect(names(25)).toBe('PACT-Z');
    expect(names(26)).toBe('PACT-AA');
    expect(names(27)).toBe('PACT-AB');
  });
});
