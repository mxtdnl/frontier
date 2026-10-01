export type KeyAction = 'board' | 'trust' | 'pacts' | 'audit' | 'disclosure' | 'summit' | 'advance' | 'end';

export interface KeyBinding {
  action: KeyAction;
  fKey: string;
  /** Shift+letter alternative, for keyboards where F-keys need Fn. */
  letter: string;
  label: string;
}

/** F-key bar order (spec §14.1). F1, F5, F11 and F12 are never bound. */
export const KEY_BINDINGS: ReadonlyArray<KeyBinding> = [
  { action: 'board', fKey: 'F2', letter: 'B', label: 'BOARD' },
  { action: 'trust', fKey: 'F3', letter: 'T', label: 'TRUST' },
  { action: 'pacts', fKey: 'F4', letter: 'P', label: 'PACTS' },
  { action: 'audit', fKey: 'F6', letter: 'F', label: 'AUDIT' },
  { action: 'disclosure', fKey: 'F7', letter: 'D', label: 'DISCL' },
  { action: 'summit', fKey: 'F8', letter: 'S', label: 'SUMMIT' },
  { action: 'advance', fKey: 'F9', letter: 'A', label: 'ADVANCE' },
  { action: 'end', fKey: 'F10', letter: 'E', label: 'END' },
];

export const NEVER_BOUND: ReadonlyArray<string> = ['F1', 'F5', 'F11', 'F12'];

export interface KeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Map a key event to an action. Shift+letter alternatives apply only while the
 * command line is not focused, so capital letters can be typed into it.
 */
export function matchKey(e: KeyLike, commandLineFocused: boolean): KeyAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (NEVER_BOUND.includes(e.key)) return null;
  for (const b of KEY_BINDINGS) {
    if (!e.shiftKey && e.key === b.fKey) return b.action;
  }
  if (e.shiftKey && !commandLineFocused && e.key.length === 1) {
    const up = e.key.toUpperCase();
    const hit = KEY_BINDINGS.find((b) => b.letter === up);
    if (hit) return hit.action;
  }
  return null;
}
