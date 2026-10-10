import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirmNode, FirmPublicNode, PublicNode, RoundNode } from '../../src/firebase/schema';
import { INITIAL_VALUATION, type ScreenData } from '../../src/screens/Screen/model';

// Every LineChart the projector renders is replaced by a recorder, so the test sees exactly which props it was given.
const calls: Array<Record<string, unknown>> = [];
vi.mock('../../src/ui/components/LineChart', () => ({
  LineChart: (props: Record<string, unknown>) => {
    calls.push(props);
    return null;
  },
}));

const { TrustPanel } = await import('../../src/screens/Screen/BoardView');
const { TrustView, FirmView } = await import('../../src/screens/Screen/Views');

const firm = (ticker: string, createdAt: number): FirmNode => ({ name: `${ticker} Inc`, ticker, createdAt, order: 0, isBot: false, botPolicy: null });
const fp = (over: Partial<FirmPublicNode>): FirmPublicNode => ({
  share: 0.5, profit: 0, valuation: INITIAL_VALUATION, rank: 1, rankDelta: 0, submittedRound: 0, auto: false, insolvent: false, breachUntilRound: 0, ...over,
});
const round = (T: number, results: RoundNode['results']): RoundNode => ({ T, dT: 0, M: 100, incidents: 1, incidentFirms: [], headlines: [], audits: [], disclosure: null, results });
const pub: PublicNode = {
  phase: 'reveal', round: 3, deadline: 1, paused: false, disclosure: false, T: 31, M: 500, collapsed: true, collapseRound: 3,
  joinLocked: true, resolvingBy: null, endedAt: null, revealStep: 0, resumePhase: null, pausedRemainingMs: null,
};
const data: ScreenData = {
  pub,
  // The facilitator has turned on "Reveal threshold": this must still never reach a projector chart.
  meta: { code: 'ABCD', title: 't', createdAt: 0, facilitatorUid: 'f', settings: { mode: 'team', timerSec: 120, autoResolve: false, revealThreshold: true, litRoom: false } },
  firms: { a: firm('AAA', 1), b: firm('BBB', 2) },
  firmsPublic: { a: fp({ rank: 1, valuation: 90 }), b: fp({ rank: 2, valuation: -20 }) },
  rounds: {
    '1': round(66, { a: { share: 0.5, profit: 2, valuation: 100, rank: 1 }, b: { share: 0.5, profit: 3, valuation: 95, rank: 2 } }),
    '2': round(48, { a: { share: 0.5, profit: 2, valuation: 95, rank: 1 }, b: { share: 0.5, profit: 3, valuation: 20, rank: 2 } }),
    '3': round(31, { a: { share: 0.5, profit: 2, valuation: 90, rank: 1 }, b: { share: 0.5, profit: 3, valuation: -20, rank: 2 } }),
  },
  pacts: {},
  wire: {},
  memberCounts: {},
};

const FORBIDDEN = ['reference', 'tau', 'threshold', 'band'];

describe('projector trust charts never receive τ', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('the board trust panel gives its chart no reference line, band or τ', () => {
    renderToStaticMarkup(createElement(TrustPanel, { data, reveal: true }));
    expect(calls).toHaveLength(1);
    const props = calls[0] as Record<string, unknown>;
    for (const k of FORBIDDEN) expect(props, k).not.toHaveProperty(k);
    expect(props.domain).toBe('trust');
    expect(props.changeStrip).toBe(true);
    expect(JSON.stringify(props)).not.toMatch(/τ|tau/i);
  });

  it('the TRUST view gives its chart no reference line, band or τ', () => {
    renderToStaticMarkup(createElement(TrustView, { data }));
    expect(calls).toHaveLength(1);
    const props = calls[0] as Record<string, unknown>;
    for (const k of FORBIDDEN) expect(props, k).not.toHaveProperty(k);
    expect(props.changeStrip).toBe(true);
    expect(JSON.stringify(props)).not.toMatch(/τ|tau/i);
  });

  it('the FIRM view draws a zero-based valuation chart with no reference line', () => {
    renderToStaticMarkup(createElement(FirmView, { ticker: 'BBB', data }));
    expect(calls).toHaveLength(1);
    const props = calls[0] as Record<string, unknown>;
    expect(props.domain).toBe('zero');
    for (const k of FORBIDDEN) expect(props, k).not.toHaveProperty(k);
  });
});
