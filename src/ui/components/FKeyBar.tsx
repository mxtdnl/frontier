import { KEY_BINDINGS, type KeyAction, type ShownKey } from '../keys';

interface Props {
  onAction: (a: KeyAction) => void;
  /** Keys to show; the primary one is solid (spec §14.1). Defaults to every key, none primary. */
  keys?: ReadonlyArray<ShownKey>;
}

export function FKeyBar({ onAction, keys = KEY_BINDINGS.map((b) => ({ ...b, primary: false })) }: Props) {
  return (
    <nav className="fkeys" aria-label="Function keys">
      {keys.map((b) => (
        <button
          key={b.action}
          type="button"
          className={`fkey${b.primary ? ' is-primary' : ''}`}
          onClick={() => onAction(b.action)}
          title={`${b.fKey} or Shift+${b.letter}`}
          aria-keyshortcuts={`${b.fKey} Shift+${b.letter}`}
          data-key={b.fKey}
          data-primary={b.primary ? '' : undefined}
        >
          <span className="k">{b.fKey}</span>
          <span>{b.label}</span>
        </button>
      ))}
    </nav>
  );
}
