/**
 * Presence (spec §12 `presence/{uid}`) and server time (spec §11 step 6).
 *
 * The client marks itself online whenever the connection is up, and registers an
 * onDisconnect write first so the server marks it offline if the tab closes or the
 * network drops. Countdowns use the server deadline plus `/.info/serverTimeOffset`;
 * nothing ever writes timer ticks.
 */
import { onDisconnect, onValue, ref, serverTimestamp, set, type Database, type Unsubscribe } from 'firebase/database';
import { paths } from './paths';

const ONLINE = () => ({ online: true, lastSeen: serverTimestamp() });
const OFFLINE = () => ({ online: false, lastSeen: serverTimestamp() });

/**
 * Keeps `presence/{uid}` up to date for this tab. Returns a stop function that marks the
 * user offline and cancels the disconnect handler.
 */
export function trackPresence(db: Database, g: string, uid: string, onError?: (e: Error) => void): () => void {
  const presenceRef = ref(db, paths.presence(g, uid));
  const unsub = onValue(ref(db, paths.connected()), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(presenceRef)
      .set(OFFLINE())
      .then(() => set(presenceRef, ONLINE()))
      .catch((e: unknown) => onError?.(e instanceof Error ? e : new Error(String(e))));
  });
  return () => {
    unsub();
    void onDisconnect(presenceRef).cancel().catch(() => undefined);
    void set(presenceRef, OFFLINE()).catch(() => undefined);
  };
}

/** True while this client is connected to the database. */
export function subscribeConnected(db: Database, cb: (connected: boolean) => void): Unsubscribe {
  return onValue(ref(db, paths.connected()), (snap) => cb(snap.val() === true));
}

/** Estimated server-minus-local clock difference in ms. */
export function subscribeServerTimeOffset(db: Database, cb: (offsetMs: number) => void): Unsubscribe {
  return onValue(ref(db, paths.serverTimeOffset()), (snap) => {
    const v: unknown = snap.val();
    cb(typeof v === 'number' ? v : 0);
  });
}

/** Estimated server time now. */
export const serverNow = (offsetMs: number, localNow: number = Date.now()): number => localNow + offsetMs;

/** Whole milliseconds left before a server deadline, never negative; null with no deadline. */
export function remainingMs(deadline: number | null, offsetMs: number, localNow: number = Date.now()): number | null {
  if (deadline === null) return null;
  return Math.max(0, deadline - serverNow(offsetMs, localNow));
}
