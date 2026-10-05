import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EXPOSURE_STEPS, commitBar, exposureStep, resultNoticeItems, resultSentence } from '../../src/screens/Play/model';
import { termsParts, termsShort } from '../../src/screens/Play/pacts';
import { nextLine, type NextInput } from '../../src/screens/Control/next';
import { ExposureMeter } from '../../src/screens/Play/Desk';
import { StepStrip } from '../../src/screens/Play/Panels';
import { findViolations } from '../../scripts/lib/copy-rules';
const checkCopy = (t: string) => findViolations(t, { allowNonTelegraphing: false });

describe('result sentence', () => {
  it('states rank, a rise and profit', () => {
    const s = resultSentence({ rank: 2, rankDelta: 1, profit: 57.7 }, 9, 3);
    expect(s.text).toBe('You ranked 2nd of 9, up 1. Profit 57.7.');
    expect(s.move).toBe(1);
  });
  it('states a fall', () => {
    const s = resultSentence({ rank: 5, rankDelta: -2, profit: 10 }, 9, 4);
    expect(s.text).toBe('You ranked 5th of 9, down 2. Profit 10.0.');
    expect(s.move).toBe(-2);
  });
  it('says unchanged when the rank holds after quarter 1', () => {
    expect(resultSentence({ rank: 1, rankDelta: 0, profit: 3 }, 4, 2).text).toBe('You ranked 1st of 4, unchanged. Profit 3.0.');
  });
  it('states no movement in quarter 1', () => {
    const s = resultSentence({ rank: 3, rankDelta: 0, profit: 3 }, 4, 1);
    expect(s.text).toBe('You ranked 3rd of 4. Profit 3.0.');
    expect(s.hasMovement).toBe(false);
  });
  it('uses Loss for a negative profit and never prints a negative zero', () => {
    expect(resultSentence({ rank: 9, rankDelta: -1, profit: -12.44 }, 9, 5).text).toBe('You ranked 9th of 9, down 1. Loss 12.4.');
    expect(resultSentence({ rank: 9, rankDelta: 0, profit: -0.01 }, 9, 5).tail).toBe('Profit 0.0.');
  });
  it('handles teen ordinals', () => {
    expect(resultSentence({ rank: 11, rankDelta: 0, profit: 1 }, 20, 2).head).toBe('You ranked 11th of 20');
    expect(resultSentence({ rank: 22, rankDelta: 0, profit: 1 }, 30, 2).head).toBe('You ranked 22nd of 30');
  });
  it('passes the copy rules', () => {
    for (const s of [resultSentence({ rank: 2, rankDelta: 1, profit: 5 }, 9, 3), resultSentence({ rank: 9, rankDelta: -3, profit: -5 }, 9, 3)]) {
      expect(checkCopy(s.text)).toEqual([]);
    }
  });
});

describe('commit bar', () => {
  const base = { open: true, committed: false, dirty: false, offline: false, error: '', time: '14:02:31', device: 'device AB', lockedText: 'Quarter closed. Results follow.' };
  it('is idle before a commit', () => expect(commitBar(base)).toEqual({ kind: 'idle', text: 'NOT COMMITTED' }));
  it('names the time, close and device after a commit', () => {
    expect(commitBar({ ...base, committed: true })).toEqual({ kind: 'committed', text: 'COMMITTED 14:02:31 · edit until close · device AB' });
  });
  it('flags a draft that differs', () => {
    expect(commitBar({ ...base, committed: true, dirty: true }).text).toBe('CHANGES NOT COMMITTED');
  });
  it('keeps the committed time once locked', () => {
    const b = commitBar({ ...base, open: false, committed: true });
    expect(b.kind).toBe('locked');
    expect(b.text).toContain('COMMITTED 14:02:31');
  });
  it('says so when nothing was committed and the desk is locked', () => {
    expect(commitBar({ ...base, open: false }).text).toContain('NOT COMMITTED');
  });
  it('offline and error take precedence', () => {
    expect(commitBar({ ...base, committed: true, offline: true }).kind).toBe('offline');
    expect(commitBar({ ...base, error: 'It failed.', offline: true }).kind).toBe('error');
  });
});

describe('exposure meter', () => {
  it('maps each label to a step of four', () => {
    expect(EXPOSURE_STEPS.map(exposureStep)).toEqual([1, 2, 3, 4]);
  });
  it('fills cells up to the step and always prints the word', () => {
    const html = renderToStaticMarkup(createElement(ExposureMeter, { label: 'HIGH' }));
    expect(html.match(/expo-cell is-hot/g)?.length).toBe(3);
    expect(html).toContain('HIGH');
    expect(renderToStaticMarkup(createElement(ExposureMeter, { label: 'LOW' }))).toContain('expo-cell is-on');
  });
});

describe('pact terms symbols', () => {
  it('writes pace and safety as symbols', () => {
    expect(termsShort({ maxPace: 2, minSafety: 15 })).toBe('pace ≤ 2 · safety ≥ 15%');
    expect(termsShort({ maxPace: 3, minSafety: null })).toBe('pace ≤ 3');
    expect(termsShort({ maxPace: null, minSafety: 5 })).toBe('safety ≥ 5%');
    expect(termsParts({ maxPace: null, minSafety: null })).toEqual([]);
  });
});

describe('result notices', () => {
  const r = { auto: true, incident: false, insolvent: false } as never;
  it('colours alerts and plain statements differently', () => {
    expect(resultNoticeItems(r, [], {}, 'a')[0]?.kind).toBe('alert');
    const none = resultNoticeItems({ auto: false, incident: false, insolvent: false } as never, [], {}, 'a');
    expect(none).toEqual([{ text: 'No notices this quarter.', kind: 'info' }]);
  });
});

describe('three-step strip', () => {
  it('lists DECIDE, COMMIT and REVEAL with one line each', () => {
    const html = renderToStaticMarkup(createElement(StepStrip));
    for (const w of ['DECIDE', 'COMMIT', 'REVEAL']) expect(html).toContain(w);
    expect((html.match(/<li>/g) ?? []).length).toBe(3);
  });
  it('passes the copy rules', () => {
    expect(checkCopy(renderToStaticMarkup(createElement(StepStrip)).replace(/<[^>]+>/g, ' '))).toEqual([]);
  });
});

describe('console NEXT line', () => {
  const i = (o: Partial<NextInput>): NextInput => ({ phase: 'open', round: 3, paused: false, committed: 2, total: 5, incomplete: false, ...o });
  it('names the expected key in every phase', () => {
    expect(nextLine(i({ phase: 'lobby', round: 0, total: 0 })).key).toBe('F9');
    expect(nextLine(i({ phase: 'briefing', round: 0 })).text).toBe('NEXT · F9 opens quarter 1.');
    expect(nextLine(i({})).text).toContain('F9 resolves quarter 3. 2 of 5 firms have committed');
    expect(nextLine(i({ committed: 5 })).text).toContain('All 5 firms have committed');
    expect(nextLine(i({ paused: true })).key).toBeNull();
    expect(nextLine(i({ phase: 'resolving' })).text).toContain('Wait');
    expect(nextLine(i({ phase: 'resolving', incomplete: true })).text).toContain('Retry resolution');
    expect(nextLine(i({ phase: 'reveal' })).text).toContain('F9 opens quarter 4');
    expect(nextLine(i({ phase: 'summit' })).key).toBe('F8');
    expect(nextLine(i({ phase: 'ended' })).text).toContain('RESULTS');
  });
  it('never states or implies the end round beyond the generic final-quarter note', () => {
    expect(nextLine(i({ phase: 'reveal', round: 14 })).text).not.toMatch(/\b14\b.*final/);
  });
});
