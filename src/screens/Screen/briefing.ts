/** Briefing copy (spec §6.6, §14.5). Contains no numbers that reveal parameters. */
/** The line above the trust figures on the board and TRST (Session 20). The briefing's first line. */
export const TRUST_EXPLAINER = 'Trust sets each quarter’s revenue. Value counts cash already banked.';

export const BRIEFING_LINES = {
  market: [
    // Owner decision 2026-11-18 (Session 20): replaces "Total market revenue tracks public trust."
    TRUST_EXPLAINER,
    'Trust recovers when pressure eases.',
    'Pace builds capability faster. Capability earns market share.',
    'Safety spend costs money. It lowers public exposure and incident risk.',
    'Valuation reflects cash plus capability, priced by the market.',
    // Owner wording 2026-10-12 (Session 19): spending and insolvency, true and without numbers.
    'Every cost comes out of cash, and cash counts in full in your valuation.',
    'A firm whose cash falls too far below zero becomes insolvent: it is held at Cautious pace and cannot play cards.',
    'A firm that falls behind on capability loses market share.',
  ],
  controls: [
    ['PACE', 'Cautious, Standard, Aggressive or Breakneck.'],
    ['SAFETY', 'Spend as a share of the reference budget.'],
    ['CARD', 'One optional action. The same card cannot repeat in consecutive quarters.'],
  ],
  cards: [
    ['POACH', 'Take capability from a named rival.'],
    ['PUBLISH', 'Release safety research.'],
    ['LOBBY', 'Press regulators on fines.'],
    ['BLITZ', 'Run a marketing push.'],
    ['SHARE', 'Give every firm your safety tooling.'],
    ['RUSH', 'Ship early. More capability, more exposure and incident risk.'],
  ],
  commits: [
    'Commit once per quarter. Change and recommit until the timer closes.',
    'Firms that do not commit keep last quarter’s settings and show AUTO.',
    'The timer is shown on every screen.',
  ],
} as const;
