import { KEY_BINDINGS, type KeyAction } from '../keys';

interface Props {
  onAction: (a: KeyAction) => void;
}

export function FKeyBar({ onAction }: Props) {
  return (
    <nav className="fkeys" aria-label="Function keys">
      {KEY_BINDINGS.map((b) => (
        <button
          key={b.action}
          type="button"
          className="fkey"
          onClick={() => onAction(b.action)}
          title={`${b.fKey} or Shift+${b.letter}`}
          aria-keyshortcuts={`${b.fKey} Shift+${b.letter}`}
        >
          <span className="k">{b.fKey}</span>
          <span>{b.label}</span>
        </button>
      ))}
    </nav>
  );
}
