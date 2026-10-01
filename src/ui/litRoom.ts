import { useEffect } from 'react';

/** Apply lit-room mode (spec §16.1) to the document while the caller is mounted. */
export function useLitRoom(on: boolean): void {
  useEffect(() => {
    document.documentElement.classList.toggle('lit-room', on);
    return () => document.documentElement.classList.remove('lit-room');
  }, [on]);
}
