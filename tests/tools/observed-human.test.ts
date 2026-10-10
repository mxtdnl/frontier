/** Observed-human room (spec §8.2, Session 17). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARAMS, type Pace } from '../../src/engine';
import {
  LONG_ROUNDS,
  OBSERVED_CYCLE,
  observedAt,
  observedHumanRates,
  observedRoom,
  parseObserved,
  simulate,
  type Trajectory,
} from '../../tools/calibration/scenarios';

const live = parseObserved(JSON.parse(readFileSync('tools/calibration/observed-human.json', 'utf8')));
/** A trajectory whose quarter q (1-based) is identified by its safety value q. */
const numbered = (len: number): Trajectory => Array.from({ length: len }, (_, i) => ({ pace: 2 as Pace, safety: i + 1, card: 'NONE' as const, auto: false }));
const safetyAt = (t: Trajectory, r: number) => observedAt(t, r).safety;

describe('observed-human data', () => {
  it('parses the 37 live trajectories', () => {
    expect(live).toHaveLength(37);
    for (const t of live) {
      expect(t.length).toBeGreaterThanOrEqual(10);
      for (const q of t) {
        expect([1, 2, 3, 4]).toContain(q.pace);
        expect(q.safety).toBeGreaterThanOrEqual(0);
        expect(q.safety).toBeLessThanOrEqual(30);
        expect(['NONE', 'POACH', 'PUBLISH', 'LOBBY', 'BLITZ']).toContain(q.card);
      }
    }
  });

  it('rejects a malformed quarter', () => {
    expect(() => parseObserved({ sessions: [{ trajectories: [['5,10,NONE,0']] }] })).toThrow();
    expect(() => parseObserved({ sessions: [{ trajectories: [['2,10,FOO,0']] }] })).toThrow();
  });
});

describe('trajectory playback', () => {
  it('plays a trajectory as recorded while it lasts', () => {
    const t = numbered(10);
    expect(Array.from({ length: 10 }, (_, r) => safetyAt(t, r))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('cycles the last 5 quarters of a short trajectory', () => {
    const t = numbered(10);
    expect(OBSERVED_CYCLE).toBe(5);
    expect(Array.from({ length: 12 }, (_, r) => safetyAt(t, 10 + r))).toEqual([6, 7, 8, 9, 10, 6, 7, 8, 9, 10, 6, 7]);
    expect(safetyAt(t, LONG_ROUNDS - 1)).toBe(10);
  });

  it('cycles the whole of a trajectory shorter than 5 quarters', () => {
    const t = numbered(3);
    expect(Array.from({ length: 7 }, (_, r) => safetyAt(t, r))).toEqual([1, 2, 3, 1, 2, 3, 1]);
  });

  it('uses only the first 30 quarters of a trajectory longer than 30', () => {
    const t = numbered(40);
    expect(Array.from({ length: LONG_ROUNDS }, (_, r) => safetyAt(t, r))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    const run = simulate(PARAMS, 1, observedRoom([t], 1, 4), LONG_ROUNDS, { keepData: true });
    const safeties = run.dataLines.filter((l) => l.includes('firm=F00|')).map((l) => Number(/\|safety=(\d+)\|/.exec(l)?.[1]));
    expect(safeties).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});

describe('observed-human room', () => {
  it('is deterministic per seed and N', () => {
    const a = observedHumanRates(PARAMS, 6, 6, live);
    const b = observedHumanRates(PARAMS, 6, 6, live);
    expect(a).toEqual(b);
    const r1 = simulate(PARAMS, 3, observedRoom(live, 3, 8), 12, { keepData: true });
    const r2 = simulate(PARAMS, 3, observedRoom(live, 3, 8), 12, { keepData: true });
    expect(r1.dataLines).toEqual(r2.dataLines);
  });

  it('draws different rooms for different seeds', () => {
    const lines = (seed: number) => simulate(PARAMS, seed, observedRoom(live, seed, 8), 1, { keepData: true }).dataLines.join('\n');
    expect(lines(1)).not.toEqual(lines(2));
  });

  it('gives every POACH a legal target, so the engine does not drop the card', () => {
    const t: Trajectory = [
      { pace: 2, safety: 10, card: 'POACH', auto: false },
      { pace: 2, safety: 10, card: 'NONE', auto: false },
    ];
    const run = simulate(PARAMS, 4, observedRoom([t], 4, 5), 10);
    for (const o of run.outputs) expect(o.notices.filter((n) => n.card === 'POACH')).toEqual([]);
    expect(run.outputs.flatMap((o) => Object.values(o.firms)).filter((f) => f.card === 'POACH').length).toBeGreaterThan(0);
  });

  it('reports shares in [0, 1] that rise with the horizon', () => {
    const r = observedHumanRates(PARAMS, 10, 10, live);
    expect(r.rounds).toHaveLength(10);
    expect(r.by12).toBeLessThanOrEqual(r.by14);
    expect(r.by14).toBeLessThanOrEqual(r.by20);
    expect(r.by20).toBeLessThanOrEqual(1);
  });
});
