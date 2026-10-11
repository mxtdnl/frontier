import { describe, expect, it } from 'vitest';
import type { Pact } from '../../src/engine';
import type { FirmNode, RoundNode } from '../../src/firebase/schema';
import { auditOutcomes } from '../../src/screens/Control/Control';

const firm = (ticker: string): FirmNode => ({ name: ticker, ticker, createdAt: 1, order: 0, isBot: false, botPolicy: null });
const pact: Pact = { id: 'p1', name: 'PACT-A', proposer: 'a', terms: { maxPace: 2, minSafety: null }, members: { a: 1 }, createdRound: 1, status: 'active' };
const round = (audits: RoundNode['audits']): RoundNode => ({ T: 0, dT: 0, M: 0, incidents: 0, incidentFirms: [], resolvedAt: null, headlines: [], audits, disclosure: null, results: {} });

describe('audit outcomes on the console', () => {
  it('lists automatic and manual audits newest first, with fines, waivers and expulsions', () => {
    const lines = auditOutcomes(
      {
        '1': round([{ pactId: 'p1', kind: 'auto', rounds: [1], breaches: [] }]),
        '2': round([
          { pactId: 'p1', kind: 'manual', rounds: [1, 2], breaches: [{ firmId: 'a', rounds: [2], count: 3, fine: 12.5, waived: false, expelled: true }, { firmId: 'b', rounds: [2], count: 1, fine: 0, waived: true, expelled: false }] },
        ]),
      },
      { p1: pact },
      { a: firm('AAA'), b: firm('BBB') },
    );
    expect(lines.map((l) => [l.round, l.kind])).toEqual([[2, 'MAN'], [1, 'AUTO']]);
    expect(lines[0]?.text).toBe('AAA breach #3, fine 12.5, expelled · BBB breach #1, fine waived');
    expect(lines[1]?.text).toBe('full compliance');
    expect(lines[0]?.pact).toBe('PACT-A');
  });

  it('returns nothing before any audit', () => {
    expect(auditOutcomes({ '1': round([]) }, {}, {})).toEqual([]);
  });
});
