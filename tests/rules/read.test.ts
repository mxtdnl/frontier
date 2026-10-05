/** Spec §13 read access, facilitator access and default deny. */
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { describe, it } from 'vitest';
import { admin, anon, as, g, G2, ROUND, useEnv } from './setup';

useEnv();

const get = (uid: string, path: string) => as(uid).ref(path).get();

describe('facilitator check', () => {
  it('allows the facilitator who created the game to read the whole game', async () => {
    await assertSucceeds(get('fac', g()));
  });

  it('allows the creating facilitator to read every hidden node', async () => {
    for (const p of ['engine', 'pactsPrivate', 'firmsPrivate', 'firmSecrets', 'members', 'presence', `decisions/${ROUND}`, 'results']) {
      await assertSucceeds(get('fac', g(p)));
    }
  });

  it('denies a facilitator reading a game created by another facilitator', async () => {
    await assertFails(get('fac2', g()));
    await assertFails(get('fac2', g('engine')));
    await assertFails(get('fac2', g('pactsPrivate')));
  });

  it('denies an allowlist entry that is not the boolean true', async () => {
    await admin(`games/${G2}/meta/facilitatorUid`, 'fake');
    await assertFails(get('fake', `games/${G2}/engine`));
  });

  it('denies reading the game when facilitators/{uid} is missing even if meta names the user', async () => {
    await admin(`games/${G2}/meta/facilitatorUid`, 'uX');
    await assertFails(get('uX', `games/${G2}/engine`));
  });

  it('lets a user read only their own allowlist entry', async () => {
    await assertSucceeds(get('fac', 'facilitators/fac'));
    await assertSucceeds(get('uX', 'facilitators/uX'));
    await assertFails(get('uX', 'facilitators/fac'));
    await assertFails(get('fac', 'facilitators'));
  });
});

describe('public nodes', () => {
  it('lets any signed-in user read public, firms, firmsPublic, rounds, pacts and meta', async () => {
    for (const p of ['public', 'firms', 'firmsPublic', 'rounds', 'pacts', 'meta', 'wire']) {
      await assertSucceeds(get('uX', g(p)));
    }
  });

  it("lets a participant read every firm's public valuation and rank by quarter, used by the phone BOOK (Session 13)", async () => {
    await assertSucceeds(get('uA', g('rounds/1/results/fB/valuation')));
    await assertSucceeds(get('uA', g('rounds/1/results')));
    await assertSucceeds(get('uA', g('firmsPublic/fB/valuation')));
    // The BOOK chart needs nothing private from another firm, and the rules refuse it anyway.
    await assertFails(get('uA', g('firmsPrivate/fB')));
  });

  it('denies signed-out users everything', async () => {
    for (const p of ['public', 'firms', 'firmsPublic', 'rounds', 'pacts', 'meta', 'wire']) {
      await assertFails(anon().ref(g(p)).get());
    }
    await assertFails(anon().ref('codes/KXMT').get());
  });

  it('lets signed-in users look up a single join code but not list codes', async () => {
    await assertSucceeds(get('uX', 'codes/KXMT'));
    await assertFails(get('uX', 'codes'));
  });

  it('denies a participant reading the whole game node', async () => {
    await assertFails(get('uA', g()));
    await assertFails(get('uA', 'games'));
  });
});

describe('presence', () => {
  it('lets any signed-in user read online flags', async () => {
    await assertSucceeds(get('uX', g('presence/uA/online')));
    await assertSucceeds(get('uB', g('presence/uA2/online')));
  });

  it('hides lastSeen and the presence list from other participants', async () => {
    await assertFails(get('uB', g('presence/uA/lastSeen')));
    await assertFails(get('uB', g('presence/uA')));
    await assertFails(get('uB', g('presence')));
  });

  it('lets a user read their own presence entry', async () => {
    await assertSucceeds(get('uA', g('presence/uA')));
  });
});

describe('hidden nodes (participant)', () => {
  it('denies reading engine', async () => {
    await assertFails(get('uA', g('engine')));
    await assertFails(get('uA', g('engine/tau')));
    await assertFails(get('uA', g('engine/endRound')));
  });

  it('denies reading pactsPrivate', async () => {
    await assertFails(get('uA', g('pactsPrivate')));
    await assertFails(get('uA', g('pactsPrivate/p1')));
  });

  it("allows a member's own firmsPrivate and denies another firm's", async () => {
    await assertSucceeds(get('uA', g('firmsPrivate/fA')));
    await assertSucceeds(get('uA2', g('firmsPrivate/fA')));
    await assertFails(get('uA', g('firmsPrivate/fB')));
    await assertFails(get('uA', g('firmsPrivate')));
    await assertFails(get('uX', g('firmsPrivate/fA')));
  });

  it("allows a member's own firmSecrets and denies another firm's", async () => {
    await assertSucceeds(get('uA', g('firmSecrets/fA')));
    await assertFails(get('uA', g('firmSecrets/fB')));
    await assertFails(get('uA', g('firmSecrets')));
    await assertFails(get('uX', g('firmSecrets/fA')));
  });

  it("allows a member's own decision and denies another firm's", async () => {
    await assertSucceeds(get('uA', g(`decisions/${ROUND}/fA`)));
    await assertSucceeds(get('uA2', g(`decisions/${ROUND}/fA`)));
    await assertFails(get('uA', g(`decisions/${ROUND}/fB`)));
    await assertFails(get('uA', g(`decisions/${ROUND}`)));
    await assertFails(get('uA', g('decisions')));
  });

  it('allows reading own and teammate membership, denies other firms and the list', async () => {
    await assertSucceeds(get('uA', g('members/uA')));
    await assertSucceeds(get('uA', g('members/uA2')));
    await assertFails(get('uA', g('members/uB')));
    await assertFails(get('uA', g('members')));
    await assertFails(get('uX', g('members/uA')));
  });
});

describe('results', () => {
  it('denies participants before the phase is ended', async () => {
    for (const phase of ['lobby', 'briefing', 'open', 'resolving', 'reveal', 'summit']) {
      await admin(g('public/phase'), phase);
      await assertFails(get('uA', g('results')));
    }
  });

  it('allows any signed-in user once the phase is ended', async () => {
    await admin(g('public/phase'), 'ended');
    await assertSucceeds(get('uA', g('results')));
    await assertSucceeds(get('uX', g('results')));
    await assertFails(anon().ref(g('results')).get());
  });

  it('still hides engine after the end', async () => {
    await admin(g('public/phase'), 'ended');
    await assertFails(get('uA', g('engine')));
  });
});
