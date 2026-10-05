import { describe, expect, it } from 'vitest';
import { KEY_BINDINGS, NEVER_BOUND, matchKey, projectorKeys, resultsKeys, type KeyContext, type KeyLike } from '../../src/ui/keys';

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

describe('F-key bar per screen (Session 12)', () => {
  const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({ phase: 'open', view: 'board', activePacts: 1, ...over });
  const shown = (c: KeyContext) => projectorKeys(c).map((k) => k.fKey);
  const primary = (c: KeyContext) => projectorKeys(c).filter((k) => k.primary).map((k) => k.fKey);

  it('an open quarter on the board shows every acting key, F9 solid', () => {
    expect(shown(ctx())).toEqual(['F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10']);
    expect(primary(ctx())).toEqual(['F9']);
  });
  it('a view key is hidden while its view shows, and F2 returns', () => {
    expect(shown(ctx({ view: 'trust' }))).toEqual(['F2', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10']);
    expect(shown(ctx({ view: 'firm' }))).toContain('F2');
  });
  it('lobby and briefing show only disclosure and advance', () => {
    for (const phase of ['lobby', 'briefing'] as const) {
      expect(shown(ctx({ phase }))).toEqual(['F7', 'F9']);
      expect(primary(ctx({ phase }))).toEqual(['F9']);
    }
  });
  it('F6 needs an active pact and an open, reveal or summit phase', () => {
    expect(shown(ctx({ activePacts: 0 }))).not.toContain('F6');
    expect(shown(ctx({ phase: 'resolving' }))).not.toContain('F6');
    expect(shown(ctx({ phase: 'reveal' }))).toContain('F6');
  });
  it('resolving has no primary and hides advance, summit and end', () => {
    expect(primary(ctx({ phase: 'resolving' }))).toEqual([]);
    expect(shown(ctx({ phase: 'resolving' }))).toEqual(['F3', 'F4', 'F7']);
  });
  it('a summit makes F8 the primary key and hides F9', () => {
    expect(primary(ctx({ phase: 'summit' }))).toEqual(['F8']);
    expect(shown(ctx({ phase: 'summit' }))).not.toContain('F9');
  });
  it('after the end only the views and F9 (results) remain', () => {
    expect(shown(ctx({ phase: 'ended' }))).toEqual(['F3', 'F4', 'F9']);
    expect(primary(ctx({ phase: 'ended' }))).toEqual(['F9']);
  });
  it('exactly one solid key outside resolving, and it is always shown', () => {
    for (const phase of ['lobby', 'briefing', 'open', 'reveal', 'summit', 'ended'] as const) {
      expect(projectorKeys(ctx({ phase })).filter((k) => k.primary), phase).toHaveLength(1);
    }
  });
  it('the results screen shows only F9 and F2', () => {
    expect(resultsKeys(false).map((k) => k.fKey).sort()).toEqual(['F2', 'F9']);
    expect(resultsKeys(false).find((k) => k.primary)?.fKey).toBe('F9');
    expect(resultsKeys(true).some((k) => k.primary)).toBe(false);
  });
  it('F7 is labelled DISCLOSURE in full', () => {
    expect(KEY_BINDINGS.find((b) => b.fKey === 'F7')?.label).toBe('DISCLOSURE');
  });
});
