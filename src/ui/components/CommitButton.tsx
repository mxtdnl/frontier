interface Props {
  state: 'idle' | 'committed' | 'locked';
  onCommit: () => void;
}

export function CommitButton({ state, onCommit }: Props) {
  const locked = state === 'locked';
  return (
    <button type="button" className="btn btn-signal btn-block" disabled={locked} onClick={onCommit}>
      {locked ? 'LOCKED' : state === 'committed' ? 'Recommit' : 'COMMIT'}
    </button>
  );
}
