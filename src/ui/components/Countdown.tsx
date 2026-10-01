import { useEffect, useRef, useState } from 'react';
import { fmtClock } from '../format';

interface Props {
  /** Server deadline, epoch ms. */
  deadline: number;
  /** Server offset from /.info/serverTimeOffset, ms. */
  offset?: number;
  /** Timer paused: show this many ms, frozen. */
  frozenMs?: number;
}

/** Counts down to a server deadline. Announces politely at 30 s, 10 s and zero. */
export function Countdown({ deadline, offset = 0, frozenMs }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [announce, setAnnounce] = useState('');
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (frozenMs !== undefined) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [frozenMs]);

  const remaining = frozenMs ?? Math.max(0, deadline - (now + offset));
  const secs = Math.ceil(remaining / 1000);

  useEffect(() => {
    if (frozenMs !== undefined) return;
    const prev = last.current;
    last.current = secs;
    if (prev === null) return;
    for (const mark of [30, 10, 0]) {
      if (prev > mark && secs <= mark) {
        setAnnounce(mark === 0 ? 'Quarter closed.' : `${mark} seconds remaining.`);
      }
    }
  }, [secs, frozenMs]);

  return (
    <span className={`countdown${secs <= 10 && frozenMs === undefined ? ' is-low' : ''}`}>
      <span aria-hidden="true">{fmtClock(remaining)}</span>
      <span className="sr-only" role="timer" aria-live="off">
        {fmtClock(remaining)}
      </span>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </span>
  );
}
