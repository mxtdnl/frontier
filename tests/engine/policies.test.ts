import { describe, expect, it } from 'vitest';
import { PARAMS, resolveRound } from '../../src/engine';
import { game } from './helpers';

const p = PARAMS;

describe('bot policies', () => {
  it('cautious, standard and sustainable play fixed settings without cards', () => {
    for (const [policy, want] of [
      ['cautious', p.BOT_CAUTIOUS],
      ['standard', p.BOT_STANDARD],
      ['sustainable', p.BOT_SUSTAINABLE],
    ] as const) {
      const r = resolveRound(game(3, { policy }), {});
      for (const f of Object.values(r.outputs.firms)) expect(f).toMatchObject({ pace: want.pace, safety: want.safety, card: 'NONE', auto: false });
    }
  });

  it('greedy plays pace 3 or 4 about 50/50, safety 5, and BLITZ when allowed', () => {
    let s = game(8, { policy: 'greedy', seed: 11 });
    for (const f of s.firms) f.cash = 1e6; // keep every bot solvent
    let fours = 0;
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const r = resolveRound(s, {});
      for (const [id, f] of Object.entries(r.outputs.firms)) {
        if (s.firms.find((x) => x.id === id)?.insolvent) continue;
        expect([3, 4]).toContain(f.pace);
        expect(f.safety).toBe(p.BOT_GREEDY_SAFETY);
        expect(f.card).toBe(i % 2 === 0 ? 'BLITZ' : 'NONE');
        if (f.pace === 4) fours++;
        total++;
      }
      expect(r.outputs.notices).toEqual([]);
      s = r.state;
    }
    expect(fours / total).toBeGreaterThan(0.35);
    expect(fours / total).toBeLessThan(0.65);
  });

  it('a committed decision overrides the bot policy', () => {
    const r = resolveRound(game(3, { policy: 'greedy' }), { f0: { pace: 1, safety: 30, card: 'NONE', target: null } });
    expect(r.outputs.firms.f0).toMatchObject({ pace: 1, safety: 30 });
  });

  it('mimic-leader copies the leader pace only with disclosure', () => {
    const mk = (disclosure: boolean) => {
      const g = game(3, { settings: { disclosure } });
      g.firms[2]!.isBot = true;
      g.firms[2]!.botPolicy = 'mimic-leader';
      return g;
    };
    const lead = { f0: { pace: 1 as const, safety: 0, card: 'NONE' as const, target: null } };
    const on = resolveRound(mk(true), lead);
    on.state.firms[0]!.rank = 1;
    on.state.firms[1]!.rank = 2;
    on.state.firms[2]!.rank = 3;
    expect(resolveRound(on.state, {}).outputs.firms.f2).toMatchObject({ pace: 1, safety: p.BOT_MIMIC_SAFETY });
    const off = resolveRound(mk(false), lead);
    expect(resolveRound(off.state, {}).outputs.firms.f2).toMatchObject({ pace: p.BOT_MIMIC_FALLBACK_PACE, safety: p.BOT_MIMIC_SAFETY });
  });
});
