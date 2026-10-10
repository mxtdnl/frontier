/** Briefing copy (spec §6.6, §14.5). Contains no numbers that reveal parameters. */
export const BRIEFING_LINES = {
  market: [
    'Total market revenue tracks public trust.',
    'Trust recovers when pressure eases.',
    'Pace builds capability faster. Capability earns market share.',
    'Safety spend costs money. It lowers public exposure and incident risk.',
    'Valuation reflects cash plus capability, priced by the market.',
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
