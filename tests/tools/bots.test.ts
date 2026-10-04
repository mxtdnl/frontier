import { describe, expect, it } from 'vitest';
import { PARAMS } from '../../src/engine';
import { botTicker, parseArgs } from '../../tools/bots/args';
import { assignPolicies, decide, type BotView } from '../../tools/bots/policy';

const view: BotView = { lastCard: 'NONE', insolvent: false, leaderPace: null };

describe('bot policies (spec §7)', () => {
  it('cautious and standard use the parameter table', () => {
    expect(decide('cautious', view, 0.1)).toEqual({ pace: PARAMS.BOT_CAUTIOUS.pace, safety: PARAMS.BOT_CAUTIOUS.safety, card: 'NONE', target: null });
    expect(decide('standard', view, 0.9)).toEqual({ pace: PARAMS.BOT_STANDARD.pace, safety: PARAMS.BOT_STANDARD.safety, card: 'NONE', target: null });
  });
  it('greedy picks pace 3 or 4 from the draw, safety 5, BLITZ when allowed', () => {
    expect(decide('greedy', view, 0.2).pace).toBe(4);
    expect(decide('greedy', view, 0.8).pace).toBe(3);
    expect(decide('greedy', view, 0.8)).toMatchObject({ safety: PARAMS.BOT_GREEDY_SAFETY, card: 'BLITZ' });
    expect(decide('greedy', { ...view, lastCard: 'BLITZ' }, 0.8).card).toBe('NONE');
    expect(decide('greedy', { ...view, insolvent: true }, 0.8).card).toBe('NONE');
  });
  it('mimic-leader copies the leader pace, or pace 3 and safety 8 without disclosure', () => {
    expect(decide('mimic-leader', view, 0.5)).toMatchObject({ pace: 3, safety: 8, card: 'NONE' });
    expect(decide('mimic-leader', { ...view, leaderPace: 4 }, 0.5).pace).toBe(4);
  });
  it('mixed cycles through all four policies', () => {
    expect(assignPolicies('mixed', 8)).toEqual(['cautious', 'standard', 'greedy', 'mimic-leader', 'cautious', 'standard', 'greedy', 'mimic-leader']);
    expect(assignPolicies('greedy', 3)).toEqual(['greedy', 'greedy', 'greedy']);
  });
});

describe('bot arguments', () => {
  it('parses a full command line', () => {
    expect(parseArgs(['--game', 'KXMT', '--firms', '8', '--policy', 'mixed', '--delay', '0-2', '--seed', '5'])).toMatchObject({
      game: 'KXMT', firms: 8, policy: 'mixed', delayMin: 0, delayMax: 2000, seed: 5, foundOnly: false, devicesPerFirm: 1,
    });
  });
  it('accepts 49 firms and up to 5 devices per firm (Session 10)', () => {
    expect(parseArgs(['--game', 'x', '--firms', '49', '--devices-per-firm', '3'])).toMatchObject({ firms: 49, devicesPerFirm: 3 });
    expect(typeof parseArgs(['--game', 'x', '--firms', '51'])).toBe('string');
    expect(typeof parseArgs(['--game', 'x', '--devices-per-firm', '6'])).toBe('string');
    expect(typeof parseArgs(['--game', 'x', '--devices-per-firm', '0'])).toBe('string');
  });
  it('rejects missing and bad values with a message', () => {
    expect(typeof parseArgs([])).toBe('string');
    expect(typeof parseArgs(['--game', 'x', '--firms', '99'])).toBe('string');
    expect(typeof parseArgs(['--game', 'x', '--policy', 'reckless'])).toBe('string');
    expect(typeof parseArgs(['--game', 'x', '--delay', '5-1'])).toBe('string');
  });
  it('makes valid unique tickers for 50 firms', () => {
    const t = Array.from({ length: 50 }, (_, i) => botTicker(i));
    expect(new Set(t).size).toBe(50);
    t.forEach((x) => expect(x).toMatch(/^[A-Z]{3,6}$/));
  });
});
