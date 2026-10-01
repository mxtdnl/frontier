import { describe, expect, it } from 'vitest';
import { KEY_BINDINGS, NEVER_BOUND, matchKey, type KeyLike } from '../../src/ui/keys';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe('key map', () => {
  it('maps every F-key', () => {
    for (const b of KEY_BINDINGS) expect(matchKey(key(b.fKey), false)).toBe(b.action);
  });
  it('gives every F-key a Shift+letter alternative', () => {
    for (const b of KEY_BINDINGS) {
      expect(b.letter).toMatch(/^[A-Z]$/);
      expect(matchKey(key(b.letter, { shiftKey: true }), false)).toBe(b.action);
    }
  });
  it('uses unique F-keys and letters', () => {
    expect(new Set(KEY_BINDINGS.map((b) => b.fKey)).size).toBe(KEY_BINDINGS.length);
    expect(new Set(KEY_BINDINGS.map((b) => b.letter)).size).toBe(KEY_BINDINGS.length);
  });
  it('matches the documented alternatives', () => {
    const by = (l: string) => KEY_BINDINGS.find((b) => b.letter === l)?.action;
    expect(by('A')).toBe('advance');
    expect(by('S')).toBe('summit');
    expect(by('D')).toBe('disclosure');
    expect(by('E')).toBe('end');
    expect(by('F')).toBe('audit');
  });
  it('never binds F1, F5, F11 or F12', () => {
    expect(NEVER_BOUND).toEqual(['F1', 'F5', 'F11', 'F12']);
    for (const k of NEVER_BOUND) {
      expect(matchKey(key(k), false)).toBeNull();
      expect(KEY_BINDINGS.some((b) => b.fKey === k)).toBe(false);
    }
  });
  it('lets capitals be typed while the command line is focused', () => {
    expect(matchKey(key('A', { shiftKey: true }), true)).toBeNull();
    expect(matchKey(key('F9'), true)).toBe('advance');
  });
  it('ignores modified keys', () => {
    expect(matchKey(key('F9', { ctrlKey: true }), false)).toBeNull();
    expect(matchKey(key('A', { shiftKey: true, metaKey: true }), false)).toBeNull();
  });
});
