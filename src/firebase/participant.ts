/**
 * Participant sign-in and the small device-local memory used by the join flow.
 *
 * Participants sign in anonymously (spec §3). Firebase keeps that anonymous user on the
 * device, so the same `members/{uid}` entry is found again after a reload: that is what
 * restores membership on a rejoin. The only thing stored by this app is the last session's
 * join code and id, to offer a resume link on the landing page. The PIN is never stored.
 */
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { authMessage } from './auth';
import { getFirebase } from './init';

export type ParticipantAuth =
  | { kind: 'loading' }
  | { kind: 'ok'; uid: string }
  /** The browser holds a facilitator sign-in; signing in anonymously would replace it. */
  | { kind: 'facilitator-browser' }
  | { kind: 'error'; message: string };

const errorCode = (e: unknown): string => (typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '');

/** Anonymous sign-in for a participant. Reuses the device's existing anonymous user. */
export function useParticipantAuth(): ParticipantAuth {
  const [state, setState] = useState<ParticipantAuth>({ kind: 'loading' });
  const started = useRef(false);
  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setState(user.isAnonymous ? { kind: 'ok', uid: user.uid } : { kind: 'facilitator-browser' });
        return;
      }
      if (started.current) return;
      started.current = true;
      signInAnonymously(auth).catch((e: unknown) => {
        const code = errorCode(e);
        setState({
          kind: 'error',
          message:
            code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation'
              ? 'Anonymous sign-in is switched off for this project. The facilitator must enable it under Authentication in the Firebase console.'
              : authMessage(code),
        });
      });
    });
  }, []);
  return state;
}

/** True when a write was refused by the database rules. */
export function isPermissionDenied(e: unknown): boolean {
  const code = errorCode(e);
  const msg = e instanceof Error ? e.message : '';
  return code === 'PERMISSION_DENIED' || code === 'permission-denied' || /permission[_ ]denied/i.test(msg);
}

// ── Remembered session (device-local; every access is guarded) ────────────────

const KEY = 'frontier.lastSession.v1';

export interface RememberedSession {
  code: string;
  gameId: string;
}

export function rememberSession(s: RememberedSession): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the resume link is a convenience only */
  }
}

export function recallSession(): RememberedSession | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<RememberedSession>;
    return typeof v.code === 'string' && typeof v.gameId === 'string' ? { code: v.code, gameId: v.gameId } : null;
  } catch {
    return null;
  }
}

export function forgetSession(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
