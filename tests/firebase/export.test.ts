import { describe, expect, it } from 'vitest';
import { PARAMS, buildResults, resolveRound, type EngineState } from '../../src/engine';
import { assembleExport, dataText } from '../../src/firebase/export';
import { fromEngine, fromResults, type EngineNode } from '../../src/firebase/schema';
import { storeAndRead } from './rtdb';
import { dec, game } from '../engine/helpers';

function played(): { state: EngineState; lines: string[] } {
  let s = game(4, { seed: 9 });
  const lines: string[] = [];
  for (let r = 0; r < 6; r++) {
    const res = resolveRound(s, Object.fromEntries(s.firms.map((f, i) => [f.id, i === 0 ? dec(4, 0) : dec(2, 12)])), PARAMS);
    s = res.state;
    lines.push(...res.dataLines);
  }
  return { state: s, lines };
}

const nodeOf = (state: EngineState): EngineNode => fromEngine(storeAndRead({ ...state, params: PARAMS })) as EngineNode;

describe('export', () => {
  const { state, lines } = played();
  const engine = nodeOf(state);

  it('writes one DATA line per firm per quarter, in the §8.4 format', () => {
    const text = dataText(engine);
    expect(text.endsWith('\n')).toBe(true);
    const got = text.trimEnd().split('\n');
    expect(got).toHaveLength(6 * 4);
    expect(got).toEqual(lines);
    expect(got[0]).toMatch(/^DATA\|game=TEST\|round=1\|T=[\d.]+\|M=[-\d.]+\|collapsed=[01]\|firm=ARCN\|bot=0\|pace=4\|safety=0\|card=NONE\|share=/);
    expect(got[0]?.split('|').map((x) => x.split('=')[0])).toEqual([
      'DATA', 'game', 'round', 'T', 'M', 'collapsed', 'firm', 'bot', 'pace', 'safety', 'card', 'share', 'rev', 'cost', 'profit', 'cash', 'cap', 'val', 'draw', 'incident', 'auto',
    ]);
  });

  it('gives an empty file before the first quarter', () => {
    expect(dataText(nodeOf(game(3)))).toBe('');
  });

  it('JSON holds the full history, decisions and the hidden values, and survives a round trip', () => {
    const results = fromResults(storeAndRead(buildResults(state, { revealTau: false })));
    const file = assembleExport(
      {
        gameId: 'g1',
        meta: { code: 'TEST', title: 'Session TEST', createdAt: 1, facilitatorUid: 'f', settings: { mode: 'team', timerSec: 120, autoResolve: false, revealThreshold: false, litRoom: false } },
        public: { phase: 'ended', round: 6, deadline: null, paused: false, disclosure: false, T: state.T, M: state.M, collapsed: state.collapsed, collapseRound: state.collapseRound, joinLocked: true, resolvingBy: null, endedAt: 5, revealStep: 0, revealSub: 0, resumePhase: null, pausedRemainingMs: null },
        firms: {},
        engine,
        decisions: { '1': { f0: { pace: 4, safety: 0, card: 'NONE', target: null, by: 'u', at: 1 } } },
        results,
      },
      '2026-10-02T12:00:00.000Z',
    );
    const back = JSON.parse(JSON.stringify(file)) as typeof file;
    expect(back.format).toBe('frontier-export');
    expect(back.code).toBe('TEST');
    expect(back.history).toHaveLength(6);
    expect(back.history.map((h) => h.round)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(back.history[0]?.firms.f0?.pace).toBe(4);
    expect(back.engine.tau).toBe(state.tau);
    expect(back.engine.seed).toBe(state.seed);
    expect(back.decisions['1']?.f0?.pace).toBe(4);
    expect(back.results?.rounds).toBe(6);
    expect(back.exportedAt).toBe('2026-10-02T12:00:00.000Z');
  });
});
