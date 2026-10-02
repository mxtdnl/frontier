/**
 * Facilitator sign-in (spec §3): email and password, then the `/facilitators/{uid}`
 * allowlist check. The allowlist entry is set by hand in the Firebase console and the
 * rules never let the app write it.
 */
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { isFacilitator } from './api';
import { getFirebase } from './init';

export type FacilitatorStatus =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'not-listed'; uid: string; email: string }
  | { kind: 'ok'; uid: string; email: string }
  | { kind: 'error'; message: string };

/** Plain-English sign-in failures: what happened and what to do next. */
export function authMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'The email address is not valid. Check it and try again.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is wrong. Check both and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes, then try again.';
    case 'auth/network-request-failed':
      return 'The sign-in server could not be reached. Check the connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Email sign-in is switched off for this project. Enable Email/Password under Authentication in the Firebase console.';
    case 'auth/user-disabled':
      return 'This account is disabled. Enable it in the Firebase console or use another account.';
    default:
      return `Sign-in failed (${code || 'unknown error'}). Check the details and try again.`;
  }
}

export async function signInFacilitator(email: string, password: string): Promise<string | null> {
  try {
    await signInWithEmailAndPassword(getFirebase().auth, email.trim(), password);
    return null;
  } catch (e) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
    return authMessage(code);
  }
}

export const signOutUser = (): Promise<void> => signOut(getFirebase().auth);

/** Current auth state and, for an email account, whether it is on the allowlist. */
export function useFacilitatorStatus(): FacilitatorStatus {
  const [status, setStatus] = useState<FacilitatorStatus>({ kind: 'loading' });
  useEffect(() => {
    const { auth, db } = getFirebase();
    let live = true;
    const unsub = onAuthStateChanged(auth, (user: User | null) => {
      if (!user || user.isAnonymous) {
        setStatus({ kind: 'signed-out' });
        return;
      }
      setStatus({ kind: 'loading' });
      isFacilitator(db, user.uid).then(
        (listed) => {
          if (live) setStatus(listed ? { kind: 'ok', uid: user.uid, email: user.email ?? '' } : { kind: 'not-listed', uid: user.uid, email: user.email ?? '' });
        },
        () => {
          if (live) setStatus({ kind: 'error', message: 'The allowlist could not be read. Check the connection and reload the page.' });
        },
      );
    });
    return () => {
      live = false;
      unsub();
    };
  }, []);
  return status;
}
