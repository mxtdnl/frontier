/** QUARTER BRIEF builder on `#/wire` (spec §14.2, Session 19). */
import { describe, expect, it } from 'vitest';
import { breakdownSum, PARAMS, resolveRound, type EngineState, type FirmRoundResult } from '../../src/engine';
import { CLOSING_LINE, quarterBrief } from '../../src/screens/Wire/brief';
import { all, dec, game, NO_INC, TICKERS } from '../engine/helpers';

const tickers = Object.fromEntries(TICKERS.map((t, i) => [`f${i}`, t]));

/** One resolved quarter with every firm at pace 2, safety 10, no card; then the record is edited per test. */
function quarter(n: number, edit: (firms: Record<string, FirmRoundResult>) => void = () => undefined, disclosure = false): EngineState {
  const g = game(n, { settings: { disclosure } });
  const s = resolveRound(g, all(g, dec(2, 10)), NO_INC).state;
  const rec = s.history[0]!;
  // Ranks 1..n in creation order unless the test sets them.
  Object.keys(rec.firms).forEach((id, i) => {
    rec.firms[id]!.rank = i + 1;
  });
  edit(rec.firms);
  return s;
}

describe('quarterBrief', () => {
  it('splits an odd board at ceil(N/2): ranks 1–3 are the top half of 5', () => {
    const s = quarter(5, (f) => {
      f.f2!.card = 'POACH';
      f.f3!.card = 'SHARE';
      f.f0!.card = 'PUBLISH';
    });
    const b = quarterBrief(s, 1, tickers, {});
    expect(b?.lines[2]).toBe('Top half: ▲ PUBLISH ARCN · ▼ POACH CYRA. Bottom half: ▲ SHARE DOLM.');
  });

  it('lists the halves in rank order, not creation order', () => {
    const s = quarter(4, (f) => {
      f.f0!.rank = 2;
      f.f1!.rank = 1;
      f.f0!.card = 'RUSH';
      f.f1!.card = 'BLITZ';
      f.f2!.rank = 4;
      f.f3!.rank = 3;
      f.f2!.card = 'LOBBY';
    });
    expect(quarterBrief(s, 1, tickers, {})?.lines[2]).toBe('Top half: ▼ BLITZ BRLK · ▼ RUSH ARCN. Bottom half: ▼ LOBBY CYRA.');
  });

  it('says so when no firm played a card or was found in breach', () => {
    const b = quarterBrief(quarter(6), 1, tickers, {});
    expect(b?.lines[2]).toBe('Top half: no cards or breaches. Bottom half: no cards or breaches.');
  });

  it('adds breaches found by audit this quarter, with ▼', () => {
    const s = quarter(4);
    s.history[0]!.audits = [
      { pactId: 'p1', kind: 'auto', rounds: [1], breaches: [{ firmId: 'f3', rounds: [1], count: 1, fine: 10, waived: false, expelled: false }] },
    ];
    expect(quarterBrief(s, 1, tickers, { p1: 'PACT-A' })?.lines[2]).toBe('Top half: no cards or breaches. Bottom half: ▼ breach PACT-A DOLM.');
  });

  it('names the three largest draws with rank, pace and safety; ties keep creation order', () => {
    const s = quarter(5, (f) => {
      f.f3!.draw = 1.4;
      f.f1!.draw = 1.4;
      f.f4!.draw = 1.1;
      f.f3!.pace = 4;
      f.f3!.safety = 0;
    });
    expect(quarterBrief(s, 1, tickers, {})?.lines[1]).toBe(
      'Largest draws: BRLK 1.4 (2nd, pace 2 · safety 10) · DOLM 1.4 (4th, pace 4 · safety 0) · EMBR 1.1 (5th, pace 2 · safety 10).',
    );
  });

  it('shows pace and safety with disclosure off: the brief is facilitator only', () => {
    const s = quarter(4, () => undefined, false);
    expect(s.history[0]!.disclosure).toBeNull();
    expect(quarterBrief(s, 1, tickers, {})?.lines[1]).toMatch(/pace 2 · safety 10/);
  });

  it('opens with the trust change and its terms, naming the firms behind incidents, PUBLISH and LOBBY', () => {
    const p = { ...PARAMS, INC_BASE: [0, 0, 0, 1] as [number, number, number, number], TAU_MIN: -1, TAU_MAX: -1 };
    const g = game(8, { p });
    const s = resolveRound(g, { ...all(g, dec(2, 10)), f0: dec(4, 0), f1: dec(2, 10, 'PUBLISH'), f2: dec(2, 10, 'LOBBY') }, p).state;
    const b = quarterBrief(s, 1, tickers, {}, p)!;
    expect(Math.abs(breakdownSum(b.breakdown) - b.breakdown.dT)).toBeLessThan(1e-9);
    const first = b.lines[0]!;
    expect(first).toMatch(/^Trust [▲▼]\d+\.\d to \d+\.\d\. Recovery \+\d+\.\d · draw −\d+\.\d · incidents −1\.5 \(ARCN\) · PUBLISH \+0\.25 \(BRLK\) · LOBBY −0\.5 \(CYRA\)\.$/);
    expect(b.lines[3]).toBe(CLOSING_LINE);
  });

  it('reports the moratorium drop in its quarter', () => {
    const p = { ...NO_INC, TAU_MIN: 71, TAU_MAX: 71 };
    const g = game(4, { p });
    const s = resolveRound(g, all(g, dec(4, 0)), p).state;
    expect(quarterBrief(s, 1, tickers, {}, p)?.lines[0]).toMatch(/moratorium −10\.0\.$/);
  });

  it('is null for a quarter that has not resolved', () => {
    expect(quarterBrief(quarter(4), 2, tickers, {})).toBeNull();
  });

  it('never mentions the hidden level or the end round', () => {
    const s = quarter(4);
    const text = quarterBrief(s, 1, tickers, {})!.lines.join(' ');
    expect(text).not.toMatch(/τ|tau|threshold|end round|endRound/i);
    expect(text).not.toContain(s.tau.toFixed(1));
  });
});
