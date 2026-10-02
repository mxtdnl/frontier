import { useEffect, useState } from 'react';

/** Server time in ms, re-read four times a second while `active`. */
export function useServerNow(offsetMs: number, active: boolean): number {
  const [local, setLocal] = useState(() => Date.now());
  useEffect(() => {
    setLocal(Date.now());
    if (!active) return undefined;
    const id = window.setInterval(() => setLocal(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return local + offsetMs;
}

/** `flag` once it has held for `ms`; false immediately when it clears. Avoids flicker at load. */
export function useHeldFor(flag: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!flag) {
      setHeld(false);
      return undefined;
    }
    const id = window.setTimeout(() => setHeld(true), ms);
    return () => window.clearTimeout(id);
  }, [flag, ms]);
  return held;
}
