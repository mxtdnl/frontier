/** Spec §13 participant writes: decisions, firm creation, membership, presence and pacts. */
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { describe, it } from 'vitest';
import { admin, adminUpdate, as, decision, foundFirm, g, NOW, ROUND, useEnv } from './setup';

useEnv();

const dec = (uid: string, firm: string, over: Record<string, unknown> = {}, round = ROUND) =>
  as(uid).ref(g(`decisions/${round}/${firm}`)).set(decision(uid, over));

describe('decisions', () => {
  it('lets a member commit and recommit their firm decision while open', async () => {
    await assertSucceeds(dec('uA', 'fA'));
    await assertSucceeds(dec('uA2', 'fA', { pace: 4, safety: 0 }));
    await assertSucceeds(dec('uA', 'fA', { card: 'POACH', target: 'fB' }));
    for (const card of ['PUBLISH', 'LOBBY', 'BLITZ']) await assertSucceeds(dec('uA', 'fA', { card }));
  });

  it('allows a write up to 3 s after the deadline', async () => {
    await admin(g('public/deadline'), Date.now() - 1000);
    await assertSucceeds(dec('uA', 'fA'));
  });

  it('denies a late decision', async () => {
    await admin(g('public/deadline'), Date.now() - 10_000);
    await assertFails(dec('uA', 'fA'));
  });

  it('denies a decision when no deadline is set', async () => {
    await admin(g('public/deadline'), null);
    await assertFails(dec('uA', 'fA'));
  });

  it('denies a decision for the wrong round', async () => {
    await assertFails(dec('uA', 'fA', {}, ROUND + 1));
    await assertFails(dec('uA', 'fA', {}, ROUND - 1));
  });

  it('denies decisions outside the open phase', async () => {
    for (const phase of ['lobby', 'briefing', 'resolving', 'reveal', 'summit', 'ended']) {
      await admin(g('public/phase'), phase);
      await assertFails(dec('uA', 'fA'));
    }
  });

  it("denies writing another firm's decision", async () => {
    await assertFails(dec('uB', 'fA'));
    await assertFails(dec('uX', 'fA'));
    await assertFails(as('uA').ref(g(`decisions/${ROUND}/fB`)).set(decision('uA')));
  });

  it('denies a decision whose author is not the writer', async () => {
    await assertFails(as('uA').ref(g(`decisions/${ROUND}/fA`)).set(decision('uA2')));
  });

  it('denies a client-supplied timestamp', async () => {
    await assertFails(dec('uA', 'fA', { at: Date.now() }));
  });

  it('denies pace outside 1–4', async () => {
    for (const pace of [0, 5, 2.5, '2']) await assertFails(dec('uA', 'fA', { pace }));
  });

  it('denies safety that is not an integer 0–30', async () => {
    for (const safety of [-1, 31, 10.5, '10']) await assertFails(dec('uA', 'fA', { safety }));
    await assertSucceeds(dec('uA', 'fA', { safety: 30 }));
    await assertSucceeds(dec('uA', 'fA', { safety: 0 }));
  });

  it('denies a card outside the enum', async () => {
    for (const card of ['HACK', 'none', '', 3, 'share', 'RUSHX', 'SHARE ']) await assertFails(dec('uA', 'fA', { card }));
  });

  it('allows SHARE and RUSH (Session 17) without a target', async () => {
    for (const card of ['SHARE', 'RUSH']) await assertSucceeds(dec('uA', 'fA', { card }));
  });

  it('denies SHARE or RUSH from a member of another firm, and after the deadline', async () => {
    for (const card of ['SHARE', 'RUSH']) await assertFails(dec('uB', 'fA', { card }));
    await admin(g('public/deadline'), Date.now() - 10000);
    for (const card of ['SHARE', 'RUSH']) await assertFails(dec('uA', 'fA', { card }));
  });

  it('denies a target that is the own firm, unknown, or a nested path', async () => {
    await assertFails(dec('uA', 'fA', { card: 'POACH', target: 'fA' }));
    await assertFails(dec('uA', 'fA', { card: 'POACH', target: 'fZ' }));
    await assertFails(dec('uA', 'fA', { card: 'POACH', target: 'fB/name' }));
    await assertFails(dec('uA', 'fA', { card: 'POACH', target: 7 }));
  });

  it('denies missing fields, extra fields and deletion', async () => {
    const { pace: _p, ...noPace } = decision('uA');
    await assertFails(as('uA').ref(g(`decisions/${ROUND}/fA`)).set(noPace));
    await assertFails(dec('uA', 'fA', { note: 'x' }));
    await assertFails(as('uA').ref(g(`decisions/${ROUND}/fA`)).remove());
  });
});

describe('firm creation', () => {
  const found = (uid: string, over: Parameters<typeof foundFirm>[1] = {}) => as(uid).ref(g()).update(foundFirm(uid, over));

  it('lets a signed-in user found a firm with its PIN and their membership', async () => {
    await assertSucceeds(found('uX'));
  });

  it('accepts a 2-character name and 3-letter ticker', async () => {
    await assertSucceeds(found('uX', { firm: { name: 'Ab', ticker: 'ABC' } }));
  });

  it('accepts a 20-character name and 6-letter ticker', async () => {
    await assertSucceeds(found('uX', { firm: { name: 'A'.repeat(20), ticker: 'ABCDEF' } }));
  });

  it('denies founding after joins are locked', async () => {
    await admin(g('public/joinLocked'), true);
    await assertFails(found('uX'));
  });

  it('denies bad names', async () => {
    for (const name of ['A', 'A'.repeat(21), 12]) await assertFails(found('uX', { firm: { name } }));
  });

  it('denies bad tickers', async () => {
    for (const ticker of ['AB', 'ABCDEFG', 'abcd', 'AB1D', 'ÄBCD']) await assertFails(found('uX', { firm: { ticker } }));
  });

  it('denies a firm without its PIN or without the creator membership', async () => {
    await assertFails(found('uX', { omit: 'secret' }));
    await assertFails(found('uX', { omit: 'member' }));
  });

  it('denies a PIN that is not 4 digits', async () => {
    for (const pin of ['123', '12345', 'abcd', 1234]) await assertFails(found('uX', { pin }));
  });

  it('denies a creator membership whose PIN differs from the firm PIN', async () => {
    await assertFails(found('uX', { memberPin: '0000' }));
  });

  it('denies a participant creating a bot firm or setting a client timestamp', async () => {
    await assertFails(found('uX', { firm: { isBot: true, botPolicy: 'greedy' } }));
    await assertFails(found('uX', { firm: { createdAt: 5 } }));
  });

  it('denies extra fields on a firm', async () => {
    await assertFails(found('uX', { firm: { cash: 9999 } }));
  });

  it('denies overwriting or editing an existing firm', async () => {
    await assertFails(as('uA').ref(g('firms/fA/name')).set('Renamed'));
    await assertFails(as('uA').ref(g('firms/fA')).remove());
    await assertFails(
      as('uX')
        .ref(g())
        .update({ ...foundFirm('uX'), 'firms/fA': { name: 'Taken', ticker: 'TAKN', createdAt: NOW, order: 0, isBot: false } }),
    );
  });

  it("denies changing an existing firm's PIN", async () => {
    await assertFails(as('uA').ref(g('firmSecrets/fA')).set({ pin: '9999' }));
    await assertFails(as('uX').ref(g()).update({ 'firmSecrets/fA': { pin: '9999' }, 'members/uX': { firmId: 'fA', pin: '9999', joinedAt: NOW } }));
  });

  it('denies founding a firm in a game that does not exist', async () => {
    await assertFails(as('uX').ref('games/nope').update(foundFirm('uX')));
  });

  it('lets the facilitator add a bot firm', async () => {
    await assertSucceeds(as('fac').ref(g('firms/fD')).set({ name: 'Dolmen', ticker: 'DOLM', createdAt: 4, order: 3, isBot: true, botPolicy: 'cautious' }));
  });
});

describe('membership join', () => {
  const join = (uid: string, firmId: string, pin: string, extra: Record<string, unknown> = {}) =>
    as(uid).ref(g(`members/${uid}`)).set({ firmId, pin, joinedAt: NOW, ...extra });
  /** Records a PIN guess (Session 9 review, H2). The throttle is cleared first so tests do not wait 1 s. */
  const request = async (uid: string, firmId: string, pin: string): Promise<void> => {
    await admin(g(`joinThrottle/${firmId}`), null);
    await assertSucceeds(as(uid).ref(g()).update({ [`joinRequests/${firmId}/${uid}`]: { pin, at: NOW }, [`joinThrottle/${firmId}`]: NOW }));
  };

  it('lets a user join with the correct PIN after recording it', async () => {
    await request('uX', 'fA', '1111');
    await assertSucceeds(join('uX', 'fA', '1111', { label: 'GH' }));
  });

  it('denies a join with the correct PIN when no guess was recorded', async () => {
    await assertFails(join('uX', 'fA', '1111'));
  });

  it('denies a wrong PIN', async () => {
    await request('uX', 'fA', '2222');
    await assertFails(join('uX', 'fA', '2222'));
    await request('uX', 'fA', '0000');
    await assertFails(join('uX', 'fA', '0000'));
  });

  it('denies joining a firm that does not exist or has no PIN', async () => {
    await assertFails(as('uX').ref(g()).update({ 'joinRequests/fZ/uX': { pin: '1111', at: NOW }, 'joinThrottle/fZ': NOW }));
    await assertFails(join('uX', 'fZ', '1111'));
    await request('uX', 'fC', '1111');
    await assertFails(join('uX', 'fC', '1111'));
  });

  it('denies a join after joins are locked', async () => {
    await request('uX', 'fA', '1111');
    await admin(g('public/joinLocked'), true);
    await assertFails(join('uX', 'fA', '1111'));
  });

  it('allows a rejoin of an existing membership after joins are locked, without a recorded guess', async () => {
    await admin(g('public/joinLocked'), true);
    await assertSucceeds(join('uA', 'fA', '1111', { label: 'AB' }));
  });

  it('denies moving to another firm after joins are locked', async () => {
    await request('uA', 'fB', '2222');
    await admin(g('public/joinLocked'), true);
    await assertFails(join('uA', 'fB', '2222'));
  });

  it('allows moving to another firm with its recorded PIN before joins are locked', async () => {
    await assertFails(join('uA', 'fB', '2222'));
    await request('uA', 'fB', '2222');
    await assertSucceeds(join('uA', 'fB', '2222'));
  });

  it("denies writing someone else's membership", async () => {
    await request('uX', 'fA', '1111');
    await assertFails(as('uX').ref(g('members/uA')).set({ firmId: 'fA', pin: '1111', joinedAt: NOW }));
    await assertFails(as('uX').ref(g('members/uY')).set({ firmId: 'fA', pin: '1111', joinedAt: NOW }));
  });

  it('denies deleting a membership', async () => {
    await assertFails(as('uA').ref(g('members/uA')).remove());
  });

  it('denies a label over 12 characters, a future join time and extra fields', async () => {
    await request('uX', 'fA', '1111');
    await assertFails(join('uX', 'fA', '1111', { label: 'X'.repeat(13) }));
    await assertFails(join('uX', 'fA', '1111', { joinedAt: Date.now() + 3_600_000 }));
    await assertFails(join('uX', 'fA', '1111', { role: 'admin' }));
  });

  it('denies a firmId that is a nested path', async () => {
    await assertFails(join('uX', 'fA/name', '1111'));
  });

  it('denies joining a game that does not exist', async () => {
    await assertFails(as('uX').ref('games/nope/members/uX').set({ firmId: 'fA', pin: '1111', joinedAt: NOW }));
  });
});

describe('presence writes', () => {
  it('lets a user write their own presence', async () => {
    await assertSucceeds(as('uA').ref(g('presence/uA')).set({ online: true, lastSeen: NOW }));
    await assertSucceeds(as('uX').ref(g('presence/uX')).set({ online: false, lastSeen: NOW }));
  });

  it("denies writing another user's presence", async () => {
    await assertFails(as('uB').ref(g('presence/uA')).set({ online: false, lastSeen: NOW }));
  });

  it('denies bad shapes and missing games', async () => {
    await assertFails(as('uA').ref(g('presence/uA')).set({ online: 'yes', lastSeen: NOW }));
    await assertFails(as('uA').ref(g('presence/uA')).set({ online: true, lastSeen: NOW, firmId: 'fA' }));
    await assertFails(as('uA').ref('games/nope/presence/uA').set({ online: true, lastSeen: NOW }));
  });
});

describe('pacts', () => {
  const pact = (over: Record<string, unknown> = {}) => ({
    name: 'PACT-B',
    proposer: 'fB',
    terms: { maxPace: 2, minSafety: 10 },
    members: { fB: ROUND },
    createdRound: ROUND,
    status: 'active',
    ...over,
  });
  const propose = (uid: string, over: Record<string, unknown> = {}) => as(uid).ref(g('pacts/p2')).set(pact(over));

  it('lets a member of the proposer firm create a pact during open', async () => {
    await assertSucceeds(propose('uB'));
  });

  it('lets a member create a pact during summit, with one term only', async () => {
    await admin(g('public/phase'), 'summit');
    await assertSucceeds(propose('uB', { terms: { minSafety: 12 } }));
  });

  it('denies creating a pact outside open and summit', async () => {
    for (const phase of ['lobby', 'briefing', 'resolving', 'reveal', 'ended']) {
      await admin(g('public/phase'), phase);
      await assertFails(propose('uB'));
    }
  });

  it('denies a pact proposed in the name of another firm', async () => {
    await assertFails(propose('uA'));
    await assertFails(propose('uX'));
  });

  it('denies another firm as an initial member', async () => {
    await assertFails(propose('uB', { members: { fB: ROUND, fA: ROUND } }));
    await assertFails(propose('uB', { members: {} }));
  });

  it('denies bad terms, names, rounds and status', async () => {
    await assertFails(propose('uB', { terms: {} }));
    await assertFails(propose('uB', { terms: { maxPace: 5 } }));
    await assertFails(propose('uB', { terms: { minSafety: 31 } }));
    await assertFails(propose('uB', { terms: { maxPace: 2, bribe: 1 } }));
    await assertFails(propose('uB', { name: 'Cartel' }));
    await assertFails(propose('uB', { createdRound: ROUND - 1 }));
    await assertFails(propose('uB', { status: 'dissolved' }));
    await assertFails(propose('uB', { secret: true }));
  });

  it('denies editing or deleting an existing pact', async () => {
    await assertFails(as('uA').ref(g('pacts/p1/terms/maxPace')).set(4));
    await assertFails(as('uA').ref(g('pacts/p1/status')).set('dissolved'));
    await assertFails(as('uA').ref(g('pacts/p1')).remove());
    await assertFails(as('uA').ref(g('pacts/p1')).set(pact({ proposer: 'fA', members: { fA: ROUND } })));
  });

  it('lets a member add their own firm with the current round', async () => {
    await assertSucceeds(as('uB').ref(g('pacts/p1/members/fB')).set(ROUND));
  });

  it('denies a join with a round other than the current one', async () => {
    await assertFails(as('uB').ref(g('pacts/p1/members/fB')).set(ROUND - 1));
    await assertFails(as('uB').ref(g('pacts/p1/members/fB')).set('2'));
  });

  it('lets a member remove their own firm', async () => {
    await assertSucceeds(as('uA').ref(g('pacts/p1/members/fA')).remove());
  });

  it('denies adding or removing another firm', async () => {
    await assertFails(as('uA').ref(g('pacts/p1/members/fB')).set(ROUND));
    await assertFails(as('uB').ref(g('pacts/p1/members/fA')).remove());
    await assertFails(as('uX').ref(g('pacts/p1/members/fA')).remove());
  });

  it('denies membership edits on a pact that does not exist', async () => {
    await assertFails(as('uB').ref(g('pacts/p9/members/fB')).set(ROUND));
  });

  it('lets the facilitator write pacts', async () => {
    await adminUpdate(g('public'), { phase: 'reveal' });
    await assertSucceeds(as('fac').ref(g('pacts/p1/status')).set('dissolved'));
  });
});
