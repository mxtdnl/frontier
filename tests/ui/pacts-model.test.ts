import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Pact } from '../../src/engine';
import { RevealCard } from '../../src/screens/Play/Panels';
import { cardNoticeText, resultNotices, wireItems } from '../../src/screens/Play/model';
import { DEFAULT_TERMS_FORM, canPropose, pactAction, sortPacts, termsFromForm, termsText } from '../../src/screens/Play/pacts';
import type { RoundNode, WireNode } from '../../src/firebase/schema';

const pact = (over: Partial<Pact> = {}): Pact => ({
  id: 'p1', name: 'PACT-A', proposer: 'a', terms: { maxPace: 2, minSafety: null }, members: { a: 1 }, createdRound: 1, status: 'active', ...over,
});

describe('propose form', () => {
  it('requires a maximum pace, a minimum safety, or both', () => {
    expect(termsFromForm({ ...DEFAULT_TERMS_FORM, limitPace: false, limitSafety: false }).ok).toBe(false);
    expect(termsFromForm(DEFAULT_TERMS_FORM)).toEqual({ ok: true, terms: { maxPace: 2, minSafety: null } });
    expect(termsFromForm({ limitPace: false, maxPace: 2, limitSafety: true, minSafety: '12' })).toEqual({ ok: true, terms: { maxPace: null, minSafety: 12 } });
    expect(termsFromForm({ limitPace: true, maxPace: 3, limitSafety: true, minSafety: '0' })).toEqual({ ok: true, terms: { maxPace: 3, minSafety: 0 } });
  });

  it('accepts only whole safety values from 0 to 30', () => {
    for (const bad of ['', '31', '-1', '1.5', 'ten', '100']) {
      expect(termsFromForm({ limitPace: false, maxPace: 2, limitSafety: true, minSafety: bad }).ok).toBe(false);
    }
    expect(termsFromForm({ limitPace: false, maxPace: 2, limitSafety: true, minSafety: '30' }).ok).toBe(true);
  });

  it('ignores the safety text while the safety limit is off', () => {
    expect(termsFromForm({ limitPace: true, maxPace: 1, limitSafety: false, minSafety: 'junk' })).toEqual({ ok: true, terms: { maxPace: 1, minSafety: null } });
  });

  it('allows proposals only while a quarter is open or in a summit', () => {
    expect(['open', 'summit'].every((p) => canPropose(p as never))).toBe(true);
    for (const p of ['lobby', 'briefing', 'resolving', 'reveal', 'ended']) expect(canPropose(p as never)).toBe(false);
  });
});

describe('pact actions', () => {
  it('lets a member leave, a non-member join, and nobody act on a dissolved pact', () => {
    expect(pactAction(pact(), 'a')).toBe('leave');
    expect(pactAction(pact(), 'b')).toBe('join');
    expect(pactAction(pact({ status: 'dissolved' }), 'a')).toBe('none');
    expect(pactAction(pact({ status: 'dissolved' }), 'b')).toBe('none');
  });

  it('describes terms and orders active pacts first', () => {
    expect(termsText({ maxPace: 2, minSafety: 10 })).toBe('pace 2 or lower · safety 10 or higher');
    expect(termsText({ maxPace: null, minSafety: 5 })).toBe('safety 5 or higher');
    const list = sortPacts({ x: pact({ id: 'x', name: 'PACT-A', status: 'dissolved' }), y: pact({ id: 'y', name: 'PACT-B', createdRound: 2 }), z: pact({ id: 'z', name: 'PACT-C', createdRound: 1 }) });
    expect(list.map((p) => p.name)).toEqual(['PACT-C', 'PACT-B', 'PACT-A']);
  });
});

describe('card notices', () => {
  it('explains each reason a card was dropped, naming the card', () => {
    expect(cardNoticeText({ kind: 'card-cooldown', card: 'BLITZ' })).toContain('BLITZ was not played');
    expect(cardNoticeText({ kind: 'card-cooldown', card: 'BLITZ' })).toContain('consecutive');
    expect(cardNoticeText({ kind: 'card-target', card: 'POACH' })).toContain('target');
    expect(cardNoticeText({ kind: 'card-target-repeat', card: 'POACH' })).toContain('same two quarters');
    expect(cardNoticeText({ kind: 'card-insolvent', card: 'LOBBY' })).toContain('Insolvent');
  });

  it('puts card notices on the result card ahead of the other notices', () => {
    const result = { auto: false, incident: false, insolvent: false } as never;
    const lines = resultNotices(result, [], {}, 'a', [{ kind: 'card-cooldown', card: 'PUBLISH' }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('PUBLISH was not played');
    expect(resultNotices(result, [], {}, 'a')).toEqual(['No notices this quarter.']);
  });
});

describe('participant wire', () => {
  const round = (headlines: string[]): RoundNode => ({
    T: 0, dT: 0, M: 0, incidents: 0, incidentFirms: [], headlines: headlines.map((text) => ({ kind: 'ambient' as const, text })), audits: [], disclosure: null, results: {},
  });
  const live = (text: string, r: number, seq: number, at: number): WireNode => ({ at, round: r, seq, kind: 'pact-joined', text, pact: null, firm: null, joined: null });

  it('interleaves live events with resolved headlines by quarter', () => {
    const items = wireItems(
      { '1': round(['R1a', 'R1b']), '2': round(['R2a']) },
      { k1: live('JOIN during Q2', 2, 1.5, 10), k2: live('JOIN after Q2', 2, 2, 20), k3: live('JOIN during Q3', 3, 2.5, 30) },
    );
    expect(items.map((i) => i.text)).toEqual(['JOIN during Q3', 'JOIN after Q2', 'R2a', 'JOIN during Q2', 'R1a', 'R1b']);
  });
});

describe('result card rendering', () => {
  const history = {
    '3': { pace: 2, safety: 10, card: 'NONE', target: null, auto: false, expo: 1, draw: 1, incident: false, share: 0.25, revenue: 40, cost: 20, fine: 0, profit: 20, cash: 100, cap: 100, valuation: 200, rank: 2, rankDelta: 0, insolvent: false },
  } as never;
  const render = (cardNotices: Array<{ kind: 'card-cooldown' | 'card-target'; card: 'POACH' | 'BLITZ' }>) =>
    renderToStaticMarkup(createElement(RevealCard, { round: 3, history, audits: [], headlines: [], pacts: {}, firmId: 'a', cardNotices, firmCount: 2 }));

  it('shows a dropped card in the notices panel', () => {
    const html = render([{ kind: 'card-target', card: 'POACH' }]);
    expect(html).toContain('POACH was not played. It needs a valid target firm.');
    expect(html).not.toContain('No notices this quarter.');
  });

  it('shows no card notice when nothing was dropped', () => {
    expect(render([])).toContain('No notices this quarter.');
  });
});
