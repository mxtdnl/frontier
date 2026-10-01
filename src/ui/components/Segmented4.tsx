import { useRef, type KeyboardEvent } from 'react';

export interface SegOption {
  value: number;
  label: string;
  sub?: string;
}

interface Props {
  options: ReadonlyArray<SegOption>;
  value: number;
  onChange: (v: number) => void;
  label: string;
  disabled?: boolean;
}

/** Four-segment radio group. Arrow keys move and select; targets are at least 44 px. */
export function Segmented4({ options, value, onChange, label, disabled }: Props) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (i: number, e: KeyboardEvent) => {
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else return;
    e.preventDefault();
    const opt = options[next];
    if (opt) {
      onChange(opt.value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          disabled={disabled}
          ref={(el) => {
            refs.current[i] = el;
          }}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => move(i, e)}
        >
          <span className="seg-n">{o.label}</span>
          {o.sub ? <span className="seg-t">{o.sub}</span> : null}
        </button>
      ))}
    </div>
  );
}
