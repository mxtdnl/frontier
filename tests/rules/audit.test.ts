/**
 * Session 9 audit: a participant with browser developer tools, attacking the rules directly.
 * Each block names the threat from docs/SESSIONS.md (Session 9, item 1) and docs/REVIEW.md.
 */
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { describe, expect, it } from 'vitest';
import { admin, as, decision, g, NOW, ROUND, useEnv } from './setup';

useEnv();

describe('threat: reading hidden values from developer tools', () => {
  it('denies every hidden path to a member, a non-member and a signed-out user', async () => {
    const hidden = [
      '',
      'engine',
      'engine/tau',
      'engine/endRound',
      'engine/seed',
      'pactsPrivate',
      'pactsPrivate/p1/violations',
      'firmsPrivate',
      'firmsPrivate/fB',
      'firmSecrets',
      'firmSecrets/fB/pin',
      `decisions/${ROUND}`,
      `decisions/${ROUND}/fB`,
      'members',
      'members/uB',
      'presence',
      'presence/uB/lastSeen',
      'results',
    ];
    for (const uid of ['uA', 'uX']) {
      for (const path of hidden) await assertFails(as(uid).ref(g(path)).get());
    }
    await assertFails(as('uA').ref('codes').get());
    await assertFails(as('uA').ref('facilitators').get());
    await assertFails(as('uA').ref('facilitators/fac').get());
  });

  it('never stores tau or the end round in a node participants can read', async () => {
    for (const path of ['meta', 'public', 'firms', 'firmsPublic', 'rounds', 'pacts', 'wire']) {
      const snap = await assertSucceeds(as('uX').ref(g(path)).get());
      const text = JSON.stringify(snap.val());
      expect(text).not.toMatch(/tau|endRound|35\.2/);
    }
  });
});

describe("threat: writing other firms' decisions", () => {
  it('denies a member writing for another firm, alone or inside a multi-path update', async () => {
    await assertFails(as('uA').ref(g(`decisions/${ROUND}/fB`)).set(decision('uA')));
    // A combined update with one allowed path and one forbidden path fails as a whole.
    await assertFails(
      as('uA')
        .ref(g())
        .update({ [`decisions/${ROUND}/fA`]: decision('uA'), [`decisions/${ROUND}/fB`]: decision('uA') }),
    );
    const own = await as('uA').ref(g(`decisions/${ROUND}/fA`)).get();
    expect(own.val().safety).toBe(10); // seeded value; the combined update wrote nothing
  });

  it("denies writing a bot firm's decision", async () => {
    await assertFails(as('uA').ref(g(`decisions/${ROUND}/fC`)).set(decision('uA')));
  });
});

describe('threat: late writes', () => {
  it('denies writes after the grace window, while paused, while resolving and for a past quarter', async () => {
    await admin(g('public/deadline'), Date.now() - 3500);
    await assertFails(as('uA').ref(g(`decisions/${ROUND}/fA`)).set(decision('uA')));
    await admin(g('public/deadline'), null);
    await admin(g('public/paused'), true);
    await assertFails(as('uA').ref(g(`decisions/${ROUND}/fA`)).set(decision('uA')));
    await admin(g('public/deadline'), Date.now() + 60_000);
    await admin(g('public/paused'), false);
    await admin(g('public/phase'), 'resolving');
    await assertFails(as('uA').ref(g(`decisions/${ROUND}/fA`)).set(decision('uA')));
    await admin(g('public/phase'), 'open');
    await assertFails(as('uA').ref(g(`decisions/${ROUND - 1}/fA`)).set(decision('uA')));
  });

  it('denies backdating a decision with a client clock', async () => {
    await assertFails(as('uA').ref(g(`decisions/${ROUND}/fA`)).set(decision('uA', { at: Date.now() - 60_000 })));
  });
});

describe('threat: forging results', () => {
  it('denies a participant writing any resolution output or phase field', async () => {
    const forged: Array<[string, unknown]> = [
      ['public/phase', 'ended'],
      ['public/T', 100],
      ['public/joinLocked', false],
      ['public/revealStep', 5],
      ['firmsPublic/fA/valuation', 9999],
      ['firmsPublic/fA/submittedRound', ROUND],
      ['firmsPrivate/fA/cash', 9999],
      [`rounds/${ROUND}`, { T: 100, dT: 0, M: 1, incidents: 0, headlines: [] }],
      ['results', { dataLines: [] }],
      ['engine/tau', 0],
      ['pactsPrivate/p1/violations', null],
      ['wire/x', { at: 1, round: 1, seq: 1, kind: 'disclosure-on', text: 'Forged' }],
      ['pacts/p1/status', 'dissolved'],
      ['firms/fA/name', 'Renamed'],
      ['firms/fA/order', 0],
    ];
    for (const [path, value] of forged) await assertFails(as('uA').ref(g(path)).set(value));
  });

  it('denies a participant creating a firm that claims to be a bot', async () => {
    await admin(g('public/phase'), 'lobby');
    await assertFails(
      as('uX')
        .ref(g())
        .update({
          'firms/fZ': { name: 'Zed', ticker: 'ZEDD', createdAt: NOW, order: 0, isBot: true, botPolicy: 'cautious' },
          'firmSecrets/fZ': { pin: '1234' },
          'members/uX': { firmId: 'fZ', pin: '1234', joinedAt: NOW },
        }),
    );
  });
});

describe('threat: guessing PINs', () => {
  it('denies a wrong PIN and never reveals the PIN through a read', async () => {
    await admin(g('public/joinLocked'), false);
    await assertFails(as('uX').ref(g('members/uX')).set({ firmId: 'fA', pin: '0000', joinedAt: NOW }));
    await assertFails(as('uX').ref(g('firmSecrets/fA/pin')).get());
  });

  it('finds no PIN by guessing once joins are locked', async () => {
    await admin(g('public/joinLocked'), true);
    for (const pin of ['0000', '1110', '1111', '2222']) {
      await assertFails(as('uX').ref(g('members/uX')).set({ firmId: 'fA', pin, joinedAt: NOW }));
    }
  });

  it('cannot move a locked-in member to another firm even with its PIN', async () => {
    await admin(g('public/joinLocked'), true);
    await assertFails(as('uA').ref(g('members/uA')).set({ firmId: 'fB', pin: '2222', joinedAt: NOW }));
  });
});
