import { useReducedMotion } from '../useReducedMotion';

interface Props {
  /** Newest first. */
  items: ReadonlyArray<string>;
}

export function Ticker({ items }: Props) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <div className="ticker" aria-label="Wire">
        <span className="ticker-label">WIRE</span>
        <ul className="ticker-static">
          {items.slice(0, 3).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    );
  }
  const once = items.join('  ·  ') + '  ·  ';
  const text = once + once;
  return (
    <div className="ticker" aria-label="Wire">
      <span className="ticker-label">WIRE</span>
      <div className="ticker-window">
        <span className="ticker-run" style={{ ['--ticker-duration' as string]: `${Math.max(30, once.length * 0.25)}s` }}>
          {text}
        </span>
      </div>
    </div>
  );
}
