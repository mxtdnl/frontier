import { cleanCode } from '../../screens/Join/validate';

interface Props {
  id: string;
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * Session code entry drawn as four cells (spec §3). It is one text input laid over four boxes,
 * so typing, pasting, autofill and screen readers behave as for any text field. Each letter
 * advances 4ch, which lands it in the middle of its cell.
 */
export function CodeField({ id, value, onChange, invalid, describedBy }: Props) {
  return (
    <div className="code-field">
      <div className="code-cells" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`code-cell${i === value.length ? ' is-next' : ''}`} />
        ))}
      </div>
      <input
        id={id}
        className="code-input"
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={4}
        value={value}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(cleanCode(e.target.value))}
      />
    </div>
  );
}

/** "FRONTIER" with the Office of Frontier Systems line beneath (spec §3). */
export function Wordmark() {
  return (
    <div className="wordmark">
      <h1 className="wordmark-name">FRONTIER</h1>
      <p className="dim">Office of Frontier Systems</p>
    </div>
  );
}
