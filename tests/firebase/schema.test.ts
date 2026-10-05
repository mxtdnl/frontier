import { describe, expect, it } from 'vitest';
import { PARAMS, resolveRound, runCounterfactual, type EngineState } from '../../src/engine';
import {
  arr,
  engineStateOf,
  fromDecision,
  fromEngine,
  fromFirmPrivate,
  fromPact,
  fromPactPrivate,
  fromPublic,
  fromRound,
  rec,
  toPactNode,
  type EngineNode,
} from '../../src/firebase/schema';
import { dec, game } from '../engine/helpers';
import { storeAndRead } from './rtdb';

/** A game with pacts, breaches, audits, disclosure, a POACH and an insolvent firm or two. */
function richState(): EngineState {
  let s = game(4, { seed: 11, settings: { disclosure: true, autoAuditP: 0.5 } });
  s.pacts.push({ id: 'p1', name: 'PACT-A', proposer: 'f0', terms: { maxPace: 2, minSafety: null }, members: { f0: 1, f1: 1 }, createdRound: 1, status: 'active' });
  s.pacts.push({ id: 'p2', name: 'PACT-B', proposer: 'f2', terms: { maxPace: null, minSafety: 12 }, members: { f2: 1 }, createdRound: 1, status: 'active' });
  for (let r = 1; r <= 6; r++) {
    if (r === 3) s = { ...s, pendingAudits: ['p1'] };
    s = resolveRound(
      s,
      { f0: dec(4, 0, r === 2 ? 'POACH' : 'NONE', r === 2 ? 'f1' : null), f1: dec(3, 5, r === 4 ? 'LOBBY' : 'NONE'), f2: dec(2, 15, 'PUBLISH'), f3: dec(4, 0, 'BLITZ') },
      PARAMS,
    ).state;
  }
  return s;
}

const engineNode = (s: EngineState): EngineNode => ({ ...s, params: PARAMS, rngNotes: null, cfCache: null });

describe('engine node round trip', () => {
  it('restores a fresh game exactly (empty lists, null fields)', () => {
    const n = engineNode(game(6, { seed: 3, settings: { endMode: 'manual' } }));
    expect(n.history).toEqual([]);
    expect(n.endRound).toBeNull();
    expect(fromEngine(storeAndRead(n))).toEqual(n);
  });

  it('restores a played game with pacts, audits and disclosure exactly', () => {
    const s = richState();
    expect(s.history.some((h) => h.audits.length > 0)).toBe(true);
    expect(s.history.every((h) => h.disclosure !== null)).toBe(true);
    const n = engineNode(s);
    expect(fromEngine(storeAndRead(n))).toEqual(n);
  });

  it('restores the counterfactual cache', () => {
    const s = richState();
    const n: EngineNode = { ...engineNode(s), rngNotes: 'seed 11', cfCache: runCounterfactual(s, PARAMS) };
    expect(fromEngine(storeAndRead(n))).toEqual(n);
  });

  it('gives the engine identical results after a round trip', () => {
    const s = richState();
    const back = engineStateOf(fromEngine(storeAndRead(engineNode(s))) as EngineNode);
    const d = { f0: dec(3, 5), f1: dec(2, 10), f2: dec(1, 20), f3: dec(4, 0) };
    expect(resolveRound(back, d, PARAMS)).toEqual(resolveRound(s, d, PARAMS));
  });

  it('returns null for a missing node', () => {
    expect(fromEngine(null)).toBeNull();
    expect(fromPublic(undefined)).toBeNull();
    expect(fromRound(null)).toBeNull();
    expect(fromFirmPrivate(null)).toBeNull();
    expect(fromDecision(null)).toBeNull();
  });
});

describe('participant-visible nodes', () => {
  it('restores null fields on public', () => {
    const pub = { phase: 'open', round: 3, deadline: 1000, paused: false, disclosure: false, T: 70, M: 380, collapsed: false, collapseRound: null, joinLocked: true, resolvingBy: null, endedAt: null, revealStep: 0, resumePhase: null, pausedRemainingMs: null };
    expect(fromPublic(storeAndRead(pub))).toEqual(pub);
  });

  it('keeps the summit return phase and the frozen timer', () => {
    const pub = { phase: 'summit', round: 2, deadline: null, paused: true, disclosure: false, T: 70, M: 380, collapsed: false, collapseRound: null, joinLocked: true, resolvingBy: null, endedAt: null, revealStep: 0, resumePhase: 'open', pausedRemainingMs: 41_000 };
    expect(fromPublic(storeAndRead(pub))).toEqual(pub);
    expect(fromPublic(storeAndRead({ ...pub, resumePhase: 'bogus' }))?.resumePhase).toBeNull();
  });

  it('restores a pact without members or with one term, keyed by id', () => {
    const p = { id: 'p9', name: 'PACT-C', proposer: 'f1', terms: { maxPace: null, minSafety: 8 }, members: {}, createdRound: 2, status: 'dissolved' as const };
    expect(fromPact(storeAndRead(toPactNode(p)), 'p9')).toEqual(p);
    expect(toPactNode(p)).not.toHaveProperty('id');
  });

  it('restores round-keyed maps that come back as arrays', () => {
    const pp = {
      violations: { 1: { f0: true as const }, 2: { f1: true as const } },
      detected: {},
      checked: { 1: { f0: true as const, f1: true as const }, 2: { f1: true as const } },
      sanctions: { f0: 1 },
      lastAuditRound: 2,
    };
    expect(Array.isArray(storeAndRead(pp.violations))).toBe(true);
    expect(Array.isArray(storeAndRead(pp.checked))).toBe(true);
    expect(fromPactPrivate(storeAndRead(pp))).toEqual({
      ...pp,
      violations: { '1': { f0: true }, '2': { f1: true } },
      checked: { '1': { f0: true, f1: true }, '2': { f1: true } },
    });
  });

  it('loads a pact record written before checked members were noted', () => {
    const old = { violations: { 3: { f0: true as const } }, detected: {}, sanctions: {}, lastAuditRound: 0 };
    expect(fromPactPrivate(storeAndRead(old)).checked).toEqual({});
  });

  it('restores a round with no audits, no disclosure and empty headlines', () => {
    const r = { T: 60, dT: -3, M: 300, incidents: 0, headlines: [], audits: [], disclosure: null, results: { f0: { share: 1, profit: 2, valuation: 3, rank: 1 } } };
    expect(fromRound(storeAndRead(r))).toEqual(r);
  });

  it('restores a decision without a target', () => {
    const d = { pace: 3, safety: 0, card: 'NONE', target: null, by: 'u1', at: 5 };
    expect(fromDecision(storeAndRead(d))).toEqual(d);
  });
});

describe('arr and rec', () => {
  it('reads lists from arrays, numeric-keyed objects and nothing', () => {
    expect(arr([1, 2])).toEqual([1, 2]);
    expect(arr({ 1: 'b', 0: 'a', 10: 'c' })).toEqual(['a', 'b', 'c']);
    expect(arr(null)).toEqual([]);
  });

  it('reads maps from objects, sparse arrays and nothing', () => {
    expect(rec([, 'x', 'y'])).toEqual({ '1': 'x', '2': 'y' });
    expect(rec({ a: 1 })).toEqual({ a: 1 });
    expect(rec(undefined)).toEqual({});
  });
});
