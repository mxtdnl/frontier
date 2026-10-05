import { describe, expect, it } from 'vitest';
import { findViolations } from '../../scripts/lib/copy-rules';
import { joinNames, revealHeadline, statusSentence, type Phase, type RevealInput, type StatusInput } from '../../src/ui/status';

const reveal = (over: Partial<RevealInput> = {}): RevealInput => ({
  round: 7,
  T: 45.6,
  prevT: 51.5,
  incidents: 2,
  leaders: ['BTC'],
  prevLeaders: ['HUMN'],
  collapseRound: null,
  ...over,
});
const input = (over: Partial<StatusInput> = {}): StatusInput => ({
  phase: 'open',
  round: 7,
  paused: false,
  leftMs: 102_000,
  collapsed: false,
  resolved: 6,
  ...over,
});
const PHASES: Phase[] = ['lobby', 'briefing', 'open', 'resolving', 'reveal', 'summit', 'ended'];

describe('reveal headline (Session 12)', () => {
  it('summarises the quarter as in the spec example', () => {
    expect(revealHeadline(reveal())).toBe('Q3 Y2 resolved · Trust ▼5.9 to 45.6 · BTC takes 1st · 2 incidents.');
  });
  it('reports a rise with ▲ and a held lead', () => {
    expect(revealHeadline(reveal({ T: 60, prevT: 57.9, leaders: ['HUMN'], incidents: 1 }))).toBe('Q3 Y2 resolved · Trust ▲2.1 to 60.0 · HUMN holds 1st · 1 incident.');
  });
  it('says unchanged when trust moves less than the shown precision', () => {
    expect(revealHeadline(reveal({ T: 50.02, prevT: 50 }))).toContain('Trust unchanged at 50.0');
  });
  it('reports no incidents', () => {
    expect(revealHeadline(reveal({ incidents: 0 }))).toContain('No incidents');
  });
  it('names every firm tied for 1st, in ticker order', () => {
    expect(revealHeadline(reveal({ leaders: ['HUMN', 'BTC'] }))).toContain('BTC and HUMN tie for 1st');
    expect(revealHeadline(reveal({ leaders: ['C', 'A', 'B'] }))).toContain('A, B and C tie for 1st');
  });
  it('a firm leaving a shared lead takes 1st rather than holds it', () => {
    expect(revealHeadline(reveal({ leaders: ['BTC'], prevLeaders: ['BTC', 'HUMN'] }))).toContain('BTC takes 1st');
  });
  it('the first quarter has no previous leader', () => {
    expect(revealHeadline(reveal({ round: 1, prevLeaders: [] }))).toMatch(/^Q1 Y1 resolved · .* · BTC takes 1st/);
  });
  it('omits the leader when no firm has a result', () => {
    expect(revealHeadline(reveal({ leaders: [] }))).toBe('Q3 Y2 resolved · Trust ▼5.9 to 45.6 · 2 incidents.');
  });
  it('marks the moratorium quarter and the quarters after it', () => {
    expect(revealHeadline(reveal({ collapseRound: 7 }))).toContain('Moratorium imposed');
    expect(revealHeadline(reveal({ round: 8, collapseRound: 7 }))).toContain('Moratorium in force');
  });
});

describe('status sentence (Session 12)', () => {
  it('open quarter: what to do and the time left', () => {
    expect(statusSentence(input())).toBe('Q3 Y2 · Decisions open. Set pace, safety and a card, then commit. 01:42 left.');
  });
  it('open quarter with the time up', () => {
    expect(statusSentence(input({ leftMs: 0 }))).toBe('Q3 Y2 · Time is up. Decisions are closed and the quarter resolves next.');
  });
  it('paused timer', () => {
    expect(statusSentence(input({ paused: true, leftMs: 65_000 }))).toBe('Q3 Y2 · Timer paused at 01:05. Decisions resume when the timer restarts.');
  });
  it('moratorium in force while decisions are open', () => {
    expect(statusSentence(input({ collapsed: true }))).toContain('Moratorium in force.');
  });
  it('lobby, briefing, resolving, summit and ended', () => {
    expect(statusSentence(input({ phase: 'lobby', round: 0 }))).toMatch(/^Lobby · .*form or join a firm\.$/);
    expect(statusSentence(input({ phase: 'briefing', round: 0 }))).toMatch(/^Briefing · .*Quarter 1 opens/);
    expect(statusSentence(input({ phase: 'resolving' }))).toBe('Q3 Y2 · Decisions closed. The quarter is resolving.');
    expect(statusSentence(input({ phase: 'summit' }))).toMatch(/^Q3 Y2 · Industry summit in session\. Propose, join or leave pacts now\./);
    expect(statusSentence(input({ phase: 'ended', resolved: 14 }))).toBe('Session ended after 14 quarters. Results follow on the results screen.');
    expect(statusSentence(input({ phase: 'ended', resolved: 1 }))).toContain('after 1 quarter.');
    expect(statusSentence(input({ phase: 'ended', resolved: 0 }))).toBe('Session ended. Results follow on the results screen.');
  });
  it('reveal uses the reveal headline', () => {
    expect(statusSentence(input({ phase: 'reveal', reveal: reveal() }))).toBe(revealHeadline(reveal()));
  });
  it('every phase gives one sentence that passes the copy rules', () => {
    for (const phase of PHASES) {
      for (const over of [{}, { paused: true }, { leftMs: 0 }, { collapsed: true }, { reveal: reveal({ collapseRound: 7 }) }]) {
        const text = statusSentence(input({ phase, ...over }));
        expect(text.length, phase).toBeGreaterThan(0);
        expect(findViolations(text, { allowNonTelegraphing: false }), `${phase}: ${text}`).toEqual([]);
        expect(text, phase).not.toMatch(/!/);
      }
    }
  });
});

describe('joinNames', () => {
  it('joins with commas and a final "and"', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
  });
});
