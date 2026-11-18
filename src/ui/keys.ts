export type KeyAction = 'board' | 'trust' | 'pacts' | 'wire' | 'audit' | 'disclosure' | 'summit' | 'advance' | 'end';

export interface KeyBinding {
  action: KeyAction;
  /** Null for a letter-only key (`WIRE`, Session 20): no F-key is free, as F1, F5, F11 and F12 are never bound. */
  fKey: string | null;
  /** Shift+letter alternative, for keyboards where F-keys need Fn. */
  letter: string;
  label: string;
}

/** F-key bar order (spec §14.1). F1, F5, F11 and F12 are never bound. */
export const KEY_BINDINGS: ReadonlyArray<KeyBinding & { fKey: string }> = [
  { action: 'board', fKey: 'F2', letter: 'B', label: 'BOARD' },
  { action: 'trust', fKey: 'F3', letter: 'T', label: 'TRUST' },
  { action: 'pacts', fKey: 'F4', letter: 'P', label: 'PACTS' },
  { action: 'audit', fKey: 'F6', letter: 'F', label: 'AUDIT' },
  { action: 'disclosure', fKey: 'F7', letter: 'D', label: 'DISCLOSURE' },
  { action: 'summit', fKey: 'F8', letter: 'S', label: 'SUMMIT' },
  { action: 'advance', fKey: 'F9', letter: 'A', label: 'ADVANCE' },
  { action: 'end', fKey: 'F10', letter: 'E', label: 'END' },
];

/** Keys with no F-key, only Shift+letter (Session 20). */
export const LETTER_BINDINGS: ReadonlyArray<KeyBinding> = [{ action: 'wire', fKey: null, letter: 'W', label: 'WIRE' }];

/** Every key in key-bar order: the view keys, then WIRE, then the session keys. */
export const ALL_BINDINGS: ReadonlyArray<KeyBinding> = [...KEY_BINDINGS.slice(0, 3), ...LETTER_BINDINGS, ...KEY_BINDINGS.slice(3)];

/** The key cap: the F-key, or ⇧ and the letter for a letter-only key. */
export const keyCap = (b: KeyBinding): string => b.fKey ?? `⇧${b.letter}`;

/** The shortcut in words, for titles and help: "F2 / Shift+B" or "Shift+W". */
export const keyWords = (b: KeyBinding, sep = ' / '): string => (b.fKey ? `${b.fKey}${sep}Shift+${b.letter}` : `Shift+${b.letter}`);

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
    const hit = ALL_BINDINGS.find((b) => b.letter === up);
    if (hit) return hit.action;
  }
  return null;
}

export type ScreenView = 'board' | 'trust' | 'pacts' | 'audit' | 'wire' | 'help' | 'firm' | 'firms' | 'ranks' | 'incid';

export interface KeyContext {
  phase: 'lobby' | 'briefing' | 'open' | 'resolving' | 'reveal' | 'summit' | 'ended';
  /** The view on the projector. */
  view: ScreenView;
  /** Active pacts that an audit could target. */
  activePacts: number;
}

export interface ShownKey extends KeyBinding {
  /** The next expected action: the one solid key. */
  primary: boolean;
}

const VIEW_OF: Partial<Record<KeyAction, ScreenView>> = { board: 'board', trust: 'trust', pacts: 'pacts', wire: 'wire', audit: 'audit' };
const AUDIT_PHASES: ReadonlyArray<KeyContext['phase']> = ['open', 'reveal', 'summit'];

/** Whether a key does anything on the projector now (spec §14.1, Session 12). */
function acts(a: KeyAction, c: KeyContext): boolean {
  const pre = c.phase === 'lobby' || c.phase === 'briefing';
  const view = VIEW_OF[a];
  if (view && (pre || c.view === view)) return false;
  switch (a) {
    case 'audit':
      return c.activePacts > 0 && AUDIT_PHASES.includes(c.phase);
    case 'disclosure':
      return c.phase !== 'ended';
    case 'summit':
      return AUDIT_PHASES.includes(c.phase);
    case 'advance':
      return c.phase !== 'resolving' && c.phase !== 'summit';
    case 'end':
      return !pre && c.phase !== 'ended' && c.phase !== 'resolving';
    default:
      return true;
  }
}

/** F-keys shown on the projector: only those that act, with the next expected action solid. */
export function projectorKeys(c: KeyContext): ShownKey[] {
  const primary: KeyAction | null = c.phase === 'summit' ? 'summit' : c.phase === 'resolving' ? null : 'advance';
  return ALL_BINDINGS.filter((b) => acts(b.action, c)).map((b) => ({ ...b, primary: b.action === primary }));
}

/** The results screen acts only on F9 (next panel) and F2 (back to the board). */
export function resultsKeys(lastPanel: boolean): ShownKey[] {
  return KEY_BINDINGS.filter((b) => b.action === 'board' || b.action === 'advance').map((b) => ({ ...b, primary: b.action === 'advance' && !lastPanel }));
}
