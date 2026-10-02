/** Spec §13 facilitator writes, game creation, join codes and facilitator-only nodes. */
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { describe, it } from 'vitest';
import { anon, as, g, G2, publicNode, ROUND, useEnv } from './setup';

useEnv();

const FAC_ONLY = ['public', 'firmsPublic', 'firmsPrivate', 'rounds', 'engine', 'results', 'pactsPrivate', 'wire'] as const;

describe('facilitator-only nodes', () => {
  it('lets the creating facilitator write each node', async () => {
    const db = as('fac');
    await assertSucceeds(db.ref(g('public')).set(publicNode({ phase: 'reveal' })));
    await assertSucceeds(db.ref(g('firmsPublic/fA/rank')).set(2));
    await assertSucceeds(db.ref(g('firmsPrivate/fA/cash')).set(80));
    await assertSucceeds(db.ref(g(`rounds/${ROUND}`)).set({ T: 70, dT: -2, M: 390, incidents: 1 }));
    await assertSucceeds(db.ref(g('engine/round')).set(ROUND));
    await assertSucceeds(db.ref(g('results/dataLines')).set(['x']));
    await assertSucceeds(db.ref(g('pactsPrivate/p1/lastAuditRound')).set(ROUND));
    await assertSucceeds(db.ref(g('wire/f-p1')).set({ at: 5, round: ROUND, seq: ROUND - 0.5, kind: 'pact-formed', text: 'x' }));
    await assertSucceeds(db.ref(g('engine/pendingAudits')).set(['p1']));
  });

  it('lets the creating facilitator make the single §11 multi-path update', async () => {
    await assertSucceeds(
      as('fac')
        .ref(g())
        .update({
          'public/phase': 'reveal',
          'public/T': 70,
          'public/resolvingBy': null,
          'firmsPublic/fA': { share: 0.5, profit: 12, valuation: 310, rank: 1, rankDelta: 0, submittedRound: 2, auto: false, insolvent: false, breachUntilRound: 0 },
          'firmsPrivate/fA': { cash: 130, cap: 101, lastCard: 'NONE', cumulativeDraw: 1.4, incidents: 0 },
          [`rounds/${ROUND}`]: { T: 70, dT: -2, M: 390, incidents: 0 },
          engine: { seed: 7, tau: 35.2, endMode: 'random', endRound: 12, round: ROUND },
          'pactsPrivate/p1': { lastAuditRound: 2 },
          'pacts/p1': { name: 'PACT-A', proposer: 'fA', terms: { maxPace: 2 }, members: { fA: 1 }, createdRound: 1, status: 'dissolved' },
        }),
    );
  });

  it('denies another facilitator writing any node of the game', async () => {
    for (const n of FAC_ONLY) await assertFails(as('fac2').ref(g(`${n}/x`)).set(1));
    await assertFails(as('fac2').ref(g('meta/facilitatorUid')).set('fac2'));
  });

  it('denies participants writing any facilitator-only node', async () => {
    for (const uid of ['uA', 'uX']) {
      for (const n of FAC_ONLY) await assertFails(as(uid).ref(g(`${n}/x`)).set(1));
      await assertFails(as(uid).ref(g('firmsPrivate/fA/cash')).set(9999));
      await assertFails(as(uid).ref(g('firmsPublic/fA/rank')).set(1));
      await assertFails(as(uid).ref(g('public/phase')).set('ended'));
      await assertFails(as(uid).ref(g('meta/title')).set('x'));
      await assertFails(as(uid).ref(g('results')).set({ final: { forged: true } }));
    }
  });

  it('denies a participant forging, editing or deleting a wire headline', async () => {
    const forged = { at: 5, round: ROUND, seq: ROUND, kind: 'moratorium', text: 'OFS imposes moratorium on frontier deployments; markets collapse' };
    await assertFails(as('uA').ref(g('wire/forged')).set(forged));
    await assertFails(as('uA').ref(g('wire/d-1-on/text')).set('edited'));
    await assertFails(as('uA').ref(g('wire/d-1-on')).remove());
    await assertFails(as('uA').ref(g('engine/pendingAudits')).set(['p1']));
    await assertFails(anon().ref(g('wire/forged')).set(forged));
  });

  it('denies signed-out writes', async () => {
    await assertFails(anon().ref(g('public/phase')).set('ended'));
  });
});

describe('game creation', () => {
  const newGame = (facilitatorUid: string) => ({
    meta: { code: 'QWER', title: 'New', createdAt: 1, facilitatorUid, settings: { timerSec: 120 } },
    public: publicNode({ phase: 'lobby', round: 0 }),
  });

  it('lets a facilitator create a game that names them', async () => {
    await assertSucceeds(as('fac').ref('games/g3').set(newGame('fac')));
  });

  it('denies a facilitator creating a game that names someone else', async () => {
    await assertFails(as('fac').ref('games/g3').set(newGame('fac2')));
  });

  it('denies a non-facilitator creating a game', async () => {
    await assertFails(as('uX').ref('games/g3').set(newGame('uX')));
    await assertFails(as('fake').ref('games/g3').set(newGame('fake')));
  });

  it('denies a facilitator overwriting or deleting a game created by another facilitator', async () => {
    await assertFails(as('fac').ref(`games/${G2}`).set(newGame('fac')));
    await assertFails(as('fac').ref(`games/${G2}`).remove());
  });

  it('lets the creating facilitator delete their game', async () => {
    await assertSucceeds(as('fac').ref(g()).remove());
  });
});

describe('join codes', () => {
  it('lets a facilitator create a code for their game in the same update as the game', async () => {
    await assertSucceeds(
      as('fac')
        .ref()
        .update({
          'games/g3/meta': { code: 'QWER', title: 'New', createdAt: 1, facilitatorUid: 'fac', settings: { timerSec: 120 } },
          'codes/QWER': 'g3',
        }),
    );
  });

  it('lets a facilitator create a code for an existing game they created', async () => {
    await assertSucceeds(as('fac').ref('codes/QWER').set('g1'));
  });

  it("denies a code that points at another facilitator's game", async () => {
    await assertFails(as('fac').ref('codes/QWER').set(G2));
  });

  it('denies taking over or repointing an existing code', async () => {
    await assertFails(as('fac').ref('codes/PLRV').set('g1'));
    await assertSucceeds(as('fac').ref('games/g3/meta').set({ code: 'QWER', title: 'New', createdAt: 1, facilitatorUid: 'fac', settings: { timerSec: 120 } }));
    await assertFails(as('fac').ref('codes/KXMT').set('g3'));
    await assertFails(as('fac').ref('codes/KXMT').set('g1'));
  });

  it('denies codes with I, O, digits or the wrong length', async () => {
    for (const c of ['QWIR', 'QWOR', 'QW1R', 'QWE', 'QWERT', 'qwer']) await assertFails(as('fac').ref(`codes/${c}`).set('g1'));
  });

  it('denies participants writing codes', async () => {
    await assertFails(as('uX').ref('codes/QWER').set('g1'));
  });

  it('lets the creating facilitator delete their code', async () => {
    await assertFails(as('fac2').ref('codes/KXMT').remove());
    await assertFails(as('uA').ref('codes/KXMT').remove());
    await assertSucceeds(as('fac').ref('codes/KXMT').remove());
  });

  it('denies writing the allowlist', async () => {
    await assertFails(as('uX').ref('facilitators/uX').set(true));
    await assertFails(as('fac').ref('facilitators/uX').set(true));
  });

  it('denies writes outside known paths', async () => {
    await assertFails(as('fac').ref('other/x').set(1));
    await assertFails(as('uA').ref('other/x').set(1));
  });
});
