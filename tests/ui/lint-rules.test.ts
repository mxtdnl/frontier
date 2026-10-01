import { describe, expect, it } from 'vitest';
import { MORATORIUM_HEADLINE, findViolations } from '../../scripts/lib/copy-rules';
import { findForbiddenCss, findHex } from '../../scripts/lib/design-rules';

const strict = { allowNonTelegraphing: false };
const results = { allowNonTelegraphing: true };

describe('copy rules', () => {
  it('flags every §15.2 term', () => {
    const terms = ['unlock', 'empower', 'seamless', 'revolutionary', 'harness', 'elevate', 'supercharge', 'game-changer', 'dive in', 'journey', 'welcome to the future', 'in today’s fast-paced', 'let’s', 'awesome', 'great job', 'oops', 'not just fast but safe'];
    for (const t of terms) expect(findViolations(`<p>${t}</p>`, results).length, t).toBeGreaterThan(0);
  });
  it('flags every §15.3 term outside the results screen', () => {
    const terms = ['commons', 'tragedy', 'sustainable', 'sustainability', 'cooperate', 'cooperation', 'collective', 'shared resource', 'tipping point', 'threshold', 'collapse', 'game', 'player', 'score', 'win', 'level'];
    for (const t of terms) expect(findViolations(`<p>${t}</p>`, strict).length, t).toBeGreaterThan(0);
  });
  it('allows §15.3 terms on the results screen only', () => {
    expect(findViolations('<p>sustainable path</p>', results)).toEqual([]);
    expect(findViolations('<p>sustainable path</p>', strict)).toHaveLength(1);
  });
  it('permits collapse only inside the moratorium headline', () => {
    expect(findViolations(`const h = '${MORATORIUM_HEADLINE}';`, strict)).toEqual([]);
    expect(findViolations('markets collapse', strict)).toHaveLength(1);
  });
  it('does not flag substrings of other words', () => {
    expect(findViolations('window gameId winner', strict)).toEqual([]);
  });
  it('flags emoji but not the permitted glyphs', () => {
    expect(findViolations('🚀', results)[0]?.rule).toBe('emoji');
    expect(findViolations('+ − · •', strict)).toEqual([]);
  });
});

describe('design rules', () => {
  it('flags hex colours', () => {
    expect(findHex('color: #fff;')).toHaveLength(1);
    expect(findHex('fill: #FFB000')).toHaveLength(1);
    expect(findHex('color: var(--signal);')).toEqual([]);
    expect(findHex('<a href="#/screen">x</a>')).toEqual([]);
  });
  it('flags forbidden CSS', () => {
    expect(findForbiddenCss('background: linear-gradient(red, blue);')).toHaveLength(1);
    expect(findForbiddenCss('box-shadow: 0 1px 2px red;')).toHaveLength(1);
    expect(findForbiddenCss('filter: blur(4px);')).toHaveLength(1);
    expect(findForbiddenCss('border-radius: 8px;')).toHaveLength(1);
    expect(findForbiddenCss('border-radius: 2px 2px 0 0;')).toEqual([]);
    expect(findForbiddenCss('border-radius: 0;')).toEqual([]);
    expect(findForbiddenCss('box-shadow: none;')).toEqual([]);
  });
});
