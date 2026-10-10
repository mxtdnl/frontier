import { describe, expect, it } from 'vitest';
import type { Pact } from '../../src/engine';
import { fromWire, type FirmNode, type RoundNode, type WireNode } from '../../src/firebase/schema';
import { disclosureEntry, mergeWire, pendingWire, wireSeq } from '../../src/firebase/wire';
import { storeAndRead } from './rtdb';

const firm = (ticker: string): FirmNode => ({ name: ticker, ticker, createdAt: 1, order: 0, isBot: false, botPolicy: null });
const firms = { a: firm('AAA'), b: firm('BBB'), c: firm('CCC') };
const pact = (over: Partial<Pact> = {}): Pact => ({ id: 'p1', name: 'PACT-A', proposer: 'a', terms: { maxPace: 2, minSafety: null }, members: { a: 1 }, createdRound: 1, status: 'active', ...over });
const open = { phase: 'open' as const, round: 2, resumePhase: null };

describe('wireSeq', () => {
  it('sits before the quarter while it is open and after it once resolved', () => {
    expect(wireSeq({ phase: 'open', round: 3, resumePhase: null })).toBe(2.5);
    expect(wireSeq({ phase: 'reveal', round: 3, resumePhase: null })).toBe(3);
    expect(wireSeq({ phase: 'summit', round: 3, resumePhase: 'open' })).toBe(2.5);
    expect(wireSeq({ phase: 'summit', round: 3, resumePhase: 'reveal' })).toBe(3);
    expect(wireSeq({ phase: 'ended', round: 3, resumePhase: null })).toBe(3);
  });
});

describe('pendingWire', () => {
  const base = { firms, rounds: {}, wire: {}, pub: open, now: 500 };

  it('derives a formed headline for a new pact and a joined headline for each later member', () => {
    const got = pendingWire({ ...base, pacts: { p1: pact({ members: { a: 1, b: 2, c: 2 } }) } });
    expect(Object.keys(got).sort()).toEqual(['f-p1', 'j-p1-b-2', 'j-p1-c-2']);
    expect(got['f-p1']).toMatchObject({ kind: 'pact-formed', round: 2, seq: 1.5, at: 500, pact: 'p1', firm: 'a', joined: 1 });
    expect(got['f-p1']?.text).toContain('AAA');
    expect(got['f-p1']?.text).toContain('PACT-A');
    expect(got['j-p1-b-2']?.text).toMatch(/BBB/);
  });

  it('is deterministic and adds nothing once the entries exist', () => {
    const pacts = { p1: pact({ members: { a: 1, b: 2 } }) };
    const first = pendingWire({ ...base, pacts });
    expect(pendingWire({ ...base, pacts, now: 9999 })['f-p1']?.text).toBe(first['f-p1']?.text);
    expect(pendingWire({ ...base, pacts, wire: first })).toEqual({});
  });

  it('skips dissolved pacts and firms that no longer exist', () => {
    expect(pendingWire({ ...base, pacts: { p1: pact({ status: 'dissolved' }) } })).toEqual({});
    expect(Object.keys(pendingWire({ ...base, pacts: { p1: pact({ members: { a: 1, zz: 2 } }) } }))).toEqual(['f-p1']);
  });

  it('publishes a departure for a member who left, once, and a fresh join after a rejoin', () => {
    const joined = pendingWire({ ...base, pacts: { p1: pact({ members: { a: 1, b: 2 } }) } });
    const left = pendingWire({ ...base, wire: joined, pacts: { p1: pact({ members: { a: 1 } }) } });
    expect(Object.keys(left)).toEqual(['l-p1-b-2']);
    expect(left['l-p1-b-2']?.kind).toBe('pact-left');
    const wire = { ...joined, ...left };
    expect(pendingWire({ ...base, wire, pacts: { p1: pact({ members: { a: 1 } }) } })).toEqual({});
    const rejoin = pendingWire({ ...base, wire, pacts: { p1: pact({ members: { a: 1, b: 3 } }) } });
    expect(Object.keys(rejoin)).toEqual(['j-p1-b-3']);
  });

  it('does not report an expulsion as a departure', () => {
    const joined = pendingWire({ ...base, pacts: { p1: pact({ members: { a: 1, b: 2 } }) } });
    const rounds = {
      '2': { T: 0, dT: 0, M: 0, incidents: 0, incidentFirms: [], headlines: [], disclosure: null, results: {}, audits: [{ pactId: 'p1', kind: 'auto', rounds: [2], breaches: [{ firmId: 'b', rounds: [2], count: 3, fine: 10, waived: false, expelled: true }] }] } satisfies RoundNode,
    };
    expect(pendingWire({ ...base, rounds, wire: joined, pacts: { p1: pact({ members: { a: 1 } }) } })).toEqual({});
  });
});

describe('disclosure headline', () => {
  it('uses the spec wording for on and off', () => {
    expect(disclosureEntry(true, open, 1).text).toBe('Assembly passes frontier disclosure rule');
    expect(disclosureEntry(false, open, 1).text).toBe('Disclosure rule suspended');
    expect(disclosureEntry(true, open, 1)).toMatchObject({ kind: 'disclosure-on', pact: null, firm: null, joined: null });
  });
});

describe('mergeWire', () => {
  const round = (headlines: string[]): RoundNode => ({ T: 0, dT: 0, M: 0, incidents: 0, incidentFirms: [], headlines: headlines.map((text) => ({ kind: 'ambient' as const, text })), audits: [], disclosure: null, results: {} });
  const live = (text: string, r: number, seq: number, at: number): WireNode => ({ at, round: r, seq, kind: 'disclosure-on', text, pact: null, firm: null, joined: null });

  it('puts the newest first, live events ahead of the resolved headlines of the same position', () => {
    const feed = mergeWire({ '1': round(['A', 'B']) }, { x: live('LIVE-AFTER', 1, 1, 10), y: live('LIVE-BEFORE-2', 2, 1.5, 20), z: live('LIVE-BEFORE-1', 1, 0.5, 5) });
    expect(feed.map((f) => f.text)).toEqual(['LIVE-BEFORE-2', 'LIVE-AFTER', 'A', 'B', 'LIVE-BEFORE-1']);
  });

  it('survives a database round trip', () => {
    const stored = storeAndRead({ k: { at: 5, round: 2, seq: 1.5, kind: 'pact-joined', text: 'T', pact: 'p', firm: 'f', joined: 2 }, bad: { at: 1 } });
    expect(fromWire(stored)).toEqual({ k: { at: 5, round: 2, seq: 1.5, kind: 'pact-joined', text: 'T', pact: 'p', firm: 'f', joined: 2 } });
    expect(fromWire(null)).toEqual({});
  });
});
