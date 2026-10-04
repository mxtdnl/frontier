import { describe, expect, it } from 'vitest';
import { PARAMS, estimatedCost, type FirmRoundResult } from '../../src/engine';
import type { PublicNode } from '../../src/firebase/schema';
import {
  CARD_INFO,
  bookRows,
  canCommit,
  cardBlocked,
  deskFigures,
  initialDraft,
  legalDraft,
  playView,
  poachTargets,
  resultNotices,
  sameDraft,
  shareChangePp,
  wireItems,
} from '../../src/screens/Play/model';

const pub = (over: Partial<PublicNode>): PublicNode => ({
  phase: 'open',
  round: 1,
  deadline: 10_000,
  paused: false,
  disclosure: false,
  T: 72,
  M: 100,
  collapsed: false,
  collapseRound: null,
  joinLocked: true,
  resolvingBy: null,
  endedAt: null,
  revealStep: 0, revealSub: 0,
  resumePhase: null,
  pausedRemainingMs: null,
  ...over,
});

const result = (over: Partial<FirmRoundResult> = {}): FirmRoundResult => ({
  pace: 3,
  safety: 8,
  card: 'NONE',
  target: null,
  auto: false,
  expo: 0.4,
  draw: 0.4,
  incident: false,
  share: 0.2,
  revenue: 50,
  cost: 30,
  fine: 0,
  profit: 20,
  cash: 120,
  cap: 12,
  valuation: 150,
  rank: 2,
  rankDelta: 0,
  insolvent: false,
  ...over,
});

describe('desk defaults (spec §6.4)', () => {
  it('uses pace 2, safety 10 and no card in round 1', () => {
    expect(initialDraft(null, null)).toEqual({ pace: 2, safety: 10, card: 'NONE', target: null });
  });
  it('keeps last quarter’s applied pace and safety, never its card', () => {
    expect(initialDraft(null, result({ pace: 4, safety: 3, card: 'BLITZ' }))).toEqual({ pace: 4, safety: 3, card: 'NONE', target: null });
  });
  it('prefers the committed decision of this quarter', () => {
    expect(initialDraft({ pace: 1, safety: 22, card: 'POACH', target: 'f2' }, result())).toEqual({ pace: 1, safety: 22, card: 'POACH', target: 'f2' });
  });
});

describe('cards (spec §5.2)', () => {
  it('blocks a repeat card and every card when insolvent, never NONE', () => {
    expect(cardBlocked('BLITZ', 'BLITZ', false)).toBe(true);
    expect(cardBlocked('PUBLISH', 'BLITZ', false)).toBe(false);
    expect(cardBlocked('LOBBY', null, true)).toBe(true);
    expect(cardBlocked('NONE', 'NONE', true)).toBe(false);
  });
  it('resets an illegal card and a repeated POACH target', () => {
    const d = { pace: 2 as const, safety: 10, card: 'BLITZ' as const, target: null };
    expect(legalDraft(d, 'BLITZ', null, false).card).toBe('NONE');
    expect(legalDraft({ ...d, card: 'POACH', target: 'f2' }, 'NONE', 'f2', false)).toMatchObject({ card: 'POACH', target: null });
    expect(legalDraft({ ...d, card: 'POACH', target: 'f3' }, 'NONE', 'f2', false).target).toBe('f3');
  });
  it('requires a target before POACH can be committed', () => {
    expect(canCommit({ pace: 2, safety: 10, card: 'POACH', target: null })).toBe(false);
    expect(canCommit({ pace: 2, safety: 10, card: 'POACH', target: 'f2' })).toBe(true);
    expect(canCommit({ pace: 2, safety: 10, card: 'NONE', target: null })).toBe(true);
  });
  it('compares drafts ignoring the target of non-POACH cards', () => {
    const a = { pace: 2 as const, safety: 10, card: 'NONE' as const, target: null };
    expect(sameDraft(a, { ...a, target: 'x' })).toBe(true);
    expect(sameDraft(a, { ...a, safety: 11 })).toBe(false);
  });
  it('takes card costs from the engine parameters', () => {
    for (const c of CARD_INFO) expect(c.cost).toBe(PARAMS.CARD_COST[c.id]);
  });
});

describe('estimate and exposure (spec §6.5)', () => {
  it('matches the engine’s estimated cost', () => {
    const d = { pace: 3 as const, safety: 12, card: 'PUBLISH' as const, target: null };
    expect(deskFigures(d).cost).toBe(estimatedCost(3, 12, 'PUBLISH', PARAMS));
  });
  it('labels low pace with high safety as less exposed than breakneck with none', () => {
    const order = ['LOW', 'MED', 'HIGH', 'SEVERE'];
    const calm = order.indexOf(deskFigures({ pace: 1, safety: 30, card: 'NONE', target: null }).exposure);
    const wild = order.indexOf(deskFigures({ pace: 4, safety: 0, card: 'NONE', target: null }).exposure);
    expect(calm).toBeLessThan(wild);
  });
});

describe('POACH targets', () => {
  it('lists every other firm, bots included, by ticker', () => {
    const firms = {
      a: { name: 'Alpha', ticker: 'ALPH', createdAt: 1, order: 0, isBot: false, botPolicy: null },
      b: { name: 'Bot', ticker: 'BOTX', createdAt: 2, order: 1, isBot: true, botPolicy: 'standard' as const },
      c: { name: 'Cedar', ticker: 'CEDR', createdAt: 3, order: 2, isBot: false, botPolicy: null },
    };
    expect(poachTargets(firms, 'a').map((t) => t.ticker)).toEqual(['BOTX', 'CEDR']);
  });
});

describe('what the participant sees', () => {
  it('locks at the server deadline', () => {
    expect(playView(pub({}), 9_999)).toBe('open');
    expect(playView(pub({}), 10_000)).toBe('closed');
  });
  it('treats a missing deadline or a pause as paused', () => {
    expect(playView(pub({ deadline: null }), 0)).toBe('paused');
    expect(playView(pub({ paused: true }), 0)).toBe('paused');
  });
  it('passes the other phases through', () => {
    for (const phase of ['lobby', 'briefing', 'resolving', 'reveal', 'summit', 'ended'] as const) {
      expect(playView(pub({ phase }), 0)).toBe(phase);
    }
  });
});

describe('book, notices, wire', () => {
  it('orders history by quarter', () => {
    const rows = bookRows({ '3': result({ rank: 3 }), '1': result({ rank: 1 }), '2': result({ rank: 2 }) });
    expect(rows.map((r) => r.round)).toEqual([1, 2, 3]);
  });
  it('computes the share change against the previous quarter only when known', () => {
    const h = { '1': result({ share: 0.2 }), '2': result({ share: 0.25 }) };
    expect(shareChangePp(h, 2)).toBeCloseTo(5);
    expect(shareChangePp(h, 1)).toBeNull();
  });
  it('lists own incident, AUTO and audit outcomes only', () => {
    const pacts = { p1: { id: 'p1', name: 'PACT-A', proposer: 'f1', terms: { maxPace: 2 as const, minSafety: null }, members: {}, createdRound: 1, status: 'active' as const } };
    const audits = [
      { pactId: 'p1', kind: 'auto' as const, rounds: [1], breaches: [{ firmId: 'f1', rounds: [1], count: 1, fine: 12, waived: false, expelled: false }, { firmId: 'f2', rounds: [1], count: 1, fine: 99, waived: false, expelled: false }] },
    ];
    const n = resultNotices(result({ incident: true, auto: true }), audits, pacts, 'f1').join(' ');
    expect(n).toMatch(/Incident/);
    expect(n).toMatch(/No decision/);
    expect(n).toMatch(/PACT-A audit found a breach\. Fine 12\.0/);
    expect(n).not.toMatch(/99/);
    expect(resultNotices(result(), [], pacts, 'f1')).toEqual(['No notices this quarter.']);
  });
  it('lists headlines newest quarter first', () => {
    const node = (t: string) => ({ T: 0, dT: 0, M: 0, incidents: 0, headlines: [{ kind: 'general' as const, text: t }], audits: [], disclosure: null, results: {} });
    const items = wireItems({ '1': node('one'), '2': node('two') } as never);
    expect(items.map((i) => i.text)).toEqual(['two', 'one']);
    expect(items[0]?.label).toBe('Q2 Y1');
  });
});
