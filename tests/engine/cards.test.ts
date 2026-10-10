/** SHARE and RUSH (spec §5.2, §6.3 steps 3–5) and the scaled PUBLISH term (step 6). Session 17. */
import { describe, expect, it } from 'vitest';
import { byPace, cardTrustDelta, dataLine, exposureOf, PARAMS, resolveRound, type Params } from '../../src/engine';
import { all, dec, firm, game, NO_INC } from './helpers';

const p = PARAMS;
/** Every firm's base incident probability is 0.3 whatever its pace and safety. */
const FLAT: Params = { ...p, INC_BASE: [0.3, 0.3, 0.3, 0.3], SAFETY_INC_EFF: 0 };

/** For each seed, checks every firm's incident against u < q(firm). */
function expectIncidents(seeds: number, n: number, decisions: (g: ReturnType<typeof game>) => Parameters<typeof resolveRound>[1], q: (i: number) => number, params: Params = FLAT): void {
  for (let seed = 1; seed <= seeds; seed++) {
    const g = game(n, { seed, p: params });
    const r = resolveRound(g, decisions(g), params);
    r.outputs.incidentDraws.forEach((u, i) => {
      expect(r.outputs.firms[`f${i}`]?.incident, `seed ${seed} firm ${i}`).toBe(u < q(i));
    });
  }
}

describe('RUSH', () => {
  it('adds RUSH_CAP_GAIN capability with no safety drag, and it stays', () => {
    const g = game(3);
    const base = resolveRound(g, all(g, dec(3, 30)));
    const r = resolveRound(g, { f0: dec(3, 30, 'RUSH'), f1: dec(3, 30), f2: dec(3, 30) });
    expect(r.outputs.firms.f0!.cap - base.outputs.firms.f0!.cap).toBeCloseTo(p.RUSH_CAP_GAIN, 12);
    const next = resolveRound(r.state, all(r.state, dec(3, 30)));
    const baseNext = resolveRound(base.state, all(base.state, dec(3, 30)));
    expect(next.outputs.firms.f0!.cap - baseNext.outputs.firms.f0!.cap).toBeCloseTo(p.RUSH_CAP_GAIN, 12);
  });

  it('applies before POACH, so a poached RUSH firm keeps the gain above the floor', () => {
    const g = game(3);
    firm(g, 'f1').cap = p.POACH_FLOOR - byPace(p.CAP_GAIN, 1);
    const r = resolveRound(g, { f0: dec(2, 10, 'POACH', 'f1'), f1: dec(1, 0, 'RUSH'), f2: dec(2, 10) });
    expect(r.outputs.firms.f1?.cap).toBeCloseTo(Math.max(p.POACH_FLOOR, p.POACH_FLOOR + p.RUSH_CAP_GAIN - p.POACH_LOSS), 12);
  });

  it('multiplies the firm’s own draw d_i, its 8/N draw and its cumulative draw by RUSH_DRAW_MULT', () => {
    const g = game(5);
    const r = resolveRound(g, { f0: dec(3, 12, 'RUSH'), f1: dec(3, 12) });
    const a = r.outputs.firms.f0!;
    const b = r.outputs.firms.f1!;
    expect(a.expo).toBeCloseTo(b.expo * p.RUSH_DRAW_MULT, 12);
    expect(a.draw).toBeCloseTo(b.draw * p.RUSH_DRAW_MULT, 12);
    expect(firm(r.state, 'f0').cumulativeDraw).toBeCloseTo(firm(r.state, 'f1').cumulativeDraw * p.RUSH_DRAW_MULT, 12);
    expect(exposureOf(3, 12, p, 'RUSH')).toBeCloseTo(b.expo * p.RUSH_DRAW_MULT, 12);
  });

  it('multiplies the firm’s own incident probability by RUSH_INC_MULT, and nobody else’s', () => {
    expectIncidents(40, 4, () => ({ f0: dec(2, 0, 'RUSH') }), (i) => (i === 0 ? 0.3 * p.RUSH_INC_MULT : 0.3));
  });

  it('costs nothing', () => {
    const g = game(2);
    const r = resolveRound(g, { f0: dec(2, 10, 'RUSH'), f1: dec(2, 10) }, NO_INC);
    expect(r.outputs.firms.f0?.cost).toBe(r.outputs.firms.f1?.cost);
    expect(p.CARD_COST.RUSH).toBe(0);
  });
});

describe('SHARE', () => {
  it('multiplies every firm’s incident probability by SHARE_INC_MULT, the player’s included', () => {
    expectIncidents(40, 4, () => ({ f0: dec(2, 0, 'SHARE') }), () => 0.3 * p.SHARE_INC_MULT);
  });

  it('stacks per card played', () => {
    expectIncidents(40, 4, () => ({ f0: dec(2, 0, 'SHARE'), f1: dec(2, 0, 'SHARE') }), () => 0.3 * p.SHARE_INC_MULT ** 2);
  });

  it('stacks with PUBLISH and RUSH', () => {
    expectIncidents(
      40,
      4,
      () => ({ f0: dec(2, 0, 'SHARE'), f1: dec(2, 0, 'PUBLISH'), f2: dec(2, 0, 'RUSH') }),
      (i) => 0.3 * p.SHARE_INC_MULT * (i === 1 ? p.PUBLISH_INC_MULT : i === 2 ? p.RUSH_INC_MULT : 1),
    );
  });

  it('costs CARD_COST.SHARE and does not change trust or draw directly', () => {
    const g = game(3);
    const r = resolveRound(g, { f0: dec(2, 10, 'SHARE'), f1: dec(2, 10), f2: dec(2, 10) }, NO_INC);
    const base = resolveRound(g, all(g, dec(2, 10)), NO_INC);
    expect(r.outputs.firms.f0!.cost - r.outputs.firms.f1!.cost).toBe(p.CARD_COST.SHARE);
    expect(r.outputs.T).toBeCloseTo(base.outputs.T, 12);
    expect(r.outputs.firms.f0!.draw).toBeCloseTo(base.outputs.firms.f0!.draw, 12);
  });
});

describe('SHARE and RUSH constraints', () => {
  for (const card of ['SHARE', 'RUSH'] as const) {
    it(`${card} cannot repeat in consecutive quarters, and needs no target`, () => {
      const r1 = resolveRound(game(3), { f0: dec(2, 10, card) });
      expect(r1.outputs.firms.f0).toMatchObject({ card, target: null });
      const r2 = resolveRound(r1.state, { f0: dec(2, 10, card) });
      expect(r2.outputs.firms.f0?.card).toBe('NONE');
      expect(r2.outputs.notices).toContainEqual({ firmId: 'f0', kind: 'card-cooldown', card });
      const r3 = resolveRound(r2.state, { f0: dec(2, 10, card) });
      expect(r3.outputs.firms.f0?.card).toBe(card);
    });

    it(`an insolvent firm cannot play ${card}, and the card has no effect`, () => {
      const g = game(3, { p: FLAT });
      firm(g, 'f0').insolvent = true;
      const r = resolveRound(g, { f0: dec(4, 0, card) }, FLAT);
      expect(r.outputs.firms.f0?.card).toBe('NONE');
      expect(r.outputs.notices).toContainEqual({ firmId: 'f0', kind: 'card-insolvent', card });
      const base = resolveRound(g, { f0: dec(1, 0) }, FLAT);
      expect(r.outputs.firms.f0?.cap).toBe(base.outputs.firms.f0?.cap);
      expect(r.outputs.firms.f0?.expo).toBe(base.outputs.firms.f0?.expo);
      expect(r.outputs.firms.f1?.incident).toBe(base.outputs.firms.f1?.incident);
    });
  }

  it('SHARE and RUSH may alternate', () => {
    const r1 = resolveRound(game(2), { f0: dec(2, 10, 'SHARE') });
    const r2 = resolveRound(r1.state, { f0: dec(2, 10, 'RUSH') });
    const r3 = resolveRound(r2.state, { f0: dec(2, 10, 'SHARE') });
    expect([r1, r2, r3].map((r) => r.outputs.firms.f0?.card)).toEqual(['SHARE', 'RUSH', 'SHARE']);
  });

  it('is deterministic with the new cards', () => {
    const run = () => {
      let s = game(6, { seed: 9 });
      const out = [];
      for (let q = 0; q < 6; q++) {
        const r = resolveRound(s, { f0: dec(4, 0, q % 2 ? 'RUSH' : 'SHARE'), f1: dec(3, 5, q % 2 ? 'SHARE' : 'RUSH') });
        out.push(r.outputs);
        s = r.state;
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('the DATA line carries the new card names', () => {
    const g = game(2);
    const r = resolveRound(g, { f0: dec(2, 10, 'RUSH'), f1: dec(2, 10, 'SHARE') });
    const line = (id: 'f0' | 'f1') => dataLine({ label: 'TEST', round: 1, T: r.outputs.T, M: r.outputs.M, collapsed: false }, firm(r.state, id), r.outputs.firms[id]!);
    expect(line('f0')).toContain('|card=RUSH|');
    expect(line('f1')).toContain('|card=SHARE|');
    expect(r.dataLines.some((l) => l.includes('|card=RUSH|'))).toBe(true);
  });
});

describe('PUBLISH trust term (§6.3 step 6)', () => {
  it('is PUBLISH_TRUST × 8/N per card; LOBBY is not scaled', () => {
    expect(cardTrustDelta(['PUBLISH'], 8, p)).toBeCloseTo(p.PUBLISH_TRUST, 12);
    expect(cardTrustDelta(['PUBLISH'], 4, p)).toBeCloseTo(p.PUBLISH_TRUST * 2, 12);
    expect(cardTrustDelta(['PUBLISH'], 10, p)).toBeCloseTo(p.PUBLISH_TRUST * 0.8, 12);
    expect(cardTrustDelta(['PUBLISH', 'PUBLISH', 'NONE'], 50, p)).toBeCloseTo(2 * p.PUBLISH_TRUST * (8 / 50), 12);
    expect(cardTrustDelta(['LOBBY'], 4, p)).toBeCloseTo(-p.LOBBY_TRUST, 12);
    expect(cardTrustDelta(['LOBBY'], 50, p)).toBeCloseTo(-p.LOBBY_TRUST, 12);
    expect(cardTrustDelta(['SHARE', 'RUSH', 'BLITZ', 'POACH'], 8, p)).toBe(0);
  });

  it('reads 0.25 per card at 8 firms, 0.2 at 10 and 0.5 at 4 with the committed values', () => {
    expect(cardTrustDelta(['PUBLISH'], 8, p)).toBeCloseTo(0.25, 12);
    expect(cardTrustDelta(['PUBLISH'], 10, p)).toBeCloseTo(0.2, 12);
    expect(cardTrustDelta(['PUBLISH'], 4, p)).toBeCloseTo(0.5, 12);
  });
});
