import { describe, expect, it } from 'vitest';
import { CODE_PATTERN, key, paths, rel } from '../../src/firebase/paths';

describe('paths', () => {
  it('builds every §12 node path', () => {
    expect(paths.facilitator('u1')).toBe('facilitators/u1');
    expect(paths.code('KXMT')).toBe('codes/KXMT');
    expect(paths.meta('g')).toBe('games/g/meta');
    expect(paths.public('g')).toBe('games/g/public');
    expect(paths.firm('g', 'f')).toBe('games/g/firms/f');
    expect(paths.firmSecret('g', 'f')).toBe('games/g/firmSecrets/f');
    expect(paths.firmPublic('g', 'f')).toBe('games/g/firmsPublic/f');
    expect(paths.firmPrivate('g', 'f')).toBe('games/g/firmsPrivate/f');
    expect(paths.member('g', 'u')).toBe('games/g/members/u');
    expect(paths.presence('g', 'u')).toBe('games/g/presence/u');
    expect(paths.decision('g', 3, 'f')).toBe('games/g/decisions/3/f');
    expect(paths.round('g', 3)).toBe('games/g/rounds/3');
    expect(paths.pactMember('g', 'p', 'f')).toBe('games/g/pacts/p/members/f');
    expect(paths.pactPrivate('g', 'p')).toBe('games/g/pactsPrivate/p');
    expect(paths.engine('g')).toBe('games/g/engine');
    expect(paths.results('g')).toBe('games/g/results');
    expect(paths.serverTimeOffset()).toBe('.info/serverTimeOffset');
  });

  it('builds relative keys for the single resolution update', () => {
    expect(rel.firmPrivate('f')).toBe('firmsPrivate/f');
    expect(rel.round(4)).toBe('rounds/4');
    expect(rel.engine()).toBe('engine');
  });

  it('rejects keys that could address another node', () => {
    for (const bad of ['a/b', 'a.b', 'a#b', 'a$b', 'a[b', 'a]b', '', 'a\nb']) expect(() => key(bad)).toThrow();
    expect(() => paths.firmPrivate('g', 'fA/../fB')).toThrow();
    expect(() => paths.member('g', '')).toThrow();
  });

  it('accepts push-style ids', () => {
    expect(key('-NxYz_09abc')).toBe('-NxYz_09abc');
  });

  it('accepts only 4-letter join codes without I and O', () => {
    expect(CODE_PATTERN.test('KXMT')).toBe(true);
    for (const c of ['KXIT', 'KXOT', 'KXM', 'KXMTA', 'kxmt', 'KX1T']) {
      expect(CODE_PATTERN.test(c)).toBe(false);
      expect(() => paths.code(c)).toThrow();
    }
  });
});
