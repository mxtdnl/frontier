interface Props {
  state: 'idle' | 'committed' | 'locked';
  onCommit: () => void;
  /** Blocks the button without changing its label (sending, offline, incomplete card). */
  disabled?: boolean;
}

export function CommitButton({ state, onCommit, disabled }: Props) {
  const locked = state === 'locked';
  return (
    <button type="button" className="btn btn-signal btn-block" disabled={locked || disabled} onClick={onCommit}>
      {locked ? 'LOCKED' : state === 'committed' ? 'Recommit' : 'COMMIT'}
    </button>
  );
}
