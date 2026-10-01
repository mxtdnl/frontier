import { useEffect, useState } from 'react';
import type { Unsubscribe } from 'firebase/database';

export interface Subscription<T> {
  data: T;
  /** True until the first value (or error) arrives for the current key. */
  loading: boolean;
  /** Set when the database refuses the read (for example, permission denied). */
  error: Error | null;
}

type Subscribe<T> = (cb: (value: T) => void, onError: (e: Error) => void) => Unsubscribe;

interface Held<T> extends Subscription<T> {
  key: string | null;
}

/**
 * Subscribes while `key` is non-null and re-subscribes when it changes. Data from a
 * previous key is never returned for a new one.
 */
export function useSubscription<T>(key: string | null, subscribe: Subscribe<T>, initial: T): Subscription<T> {
  const [held, setHeld] = useState<Held<T>>({ key: null, data: initial, loading: false, error: null });

  useEffect(() => {
    if (key === null) return undefined;
    let live = true;
    const unsub = subscribe(
      (data) => {
        if (live) setHeld({ key, data, loading: false, error: null });
      },
      (error) => {
        if (live) setHeld({ key, data: initial, loading: false, error });
      },
    );
    return () => {
      live = false;
      unsub();
    };
    // `subscribe` and `initial` are rebuilt on every render; `key` identifies the subscription.
  }, [key]);

  if (key === null) return { data: initial, loading: false, error: null };
  if (held.key !== key) return { data: initial, loading: true, error: null };
  return { data: held.data, loading: held.loading, error: held.error };
}
