import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FirmNode, RoundNode } from '../../src/firebase/schema';
import { Book } from '../../src/screens/Play/Panels';
import { bookRows } from '../../src/screens/Play/model';

const firm = (ticker: string, createdAt: number): FirmNode => ({ name: `${ticker} Inc`, ticker, createdAt, order: createdAt, isBot: false, botPolicy: null });
const round = (results: Record<string, [number, number]>): RoundNode => ({
  T: 70, dT: 0, M: 1, incidents: 0, incidentFirms: [], headlines: [], audits: [], disclosure: null,
  results: Object.fromEntries(Object.entries(results).map(([id, [valuation, rank]]) => [id, { share: 0, profit: 0, valuation, rank }])),
});

const firms = { a: firm('HUMN', 1), b: firm('BTC', 2), c: firm('ARC', 3) };
const rounds = {
  '1': round({ a: [100, 3], b: [300, 1], c: [200, 2] }),
  '2': round({ a: [350, 1], b: [280, 2], c: [200, 3] }),
  '3': round({ a: [400, 1], b: [150, 3], c: [210, 2] }),
};
/** The firm's own private history; the field chart must not depend on it. */
const history = Object.fromEntries(
  [1, 2, 3].map((r) => [String(r), { revenue: 1, cost: 1, fine: 0, profit: 0, share: 0, valuation: 9999, rank: 9, rankDelta: 0, pace: 2, safety: 10, auto: false, incident: false, insolvent: false }]),
) as unknown as Parameters<typeof bookRows>[0];

const render = () => renderToStaticMarkup(createElement(Book, { rows: bookRows(history), rounds, firms, firmId: 'a' }));

describe('phone BOOK: against the field (§14.3, Session 13)', () => {
  it('draws the own firm against every other firm from public round results', () => {
    const html = render();
    expect(html).toContain('AGAINST 2 OTHER FIRMS');
    expect(html).toContain('data-others="2"');
    // The chart is drawn from the public results (100 to 400); the private history (9999) feeds only the own table.
    expect(html).toContain('HUMN valuation by quarter, from 100.0 to 400.0, drawn against 2 other firms');
    expect((html.match(/data-context=""/g) ?? []).length).toBe(2);
  });

  it('states the rank and how long the firm has led', () => {
    expect(render()).toContain('Rank 1 of 3. Highest valuation for 2 quarters running.');
  });

  it('still shows the notice before the first quarter', () => {
    const html = renderToStaticMarkup(createElement(Book, { rows: [], rounds: {}, firms, firmId: 'a' }));
    expect(html).toContain('No quarters resolved yet');
  });
});
