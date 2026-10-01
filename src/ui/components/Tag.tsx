export type TagKind = 'BOT' | 'AUTO' | 'BREACH' | 'INSOLV';

interface Props {
  kind?: TagKind;
  /** Pact tag such as PACT-A. */
  pact?: string;
}

export function Tag({ kind, pact }: Props) {
  if (pact) return <span className="tag tag-pact">{pact}</span>;
  if (!kind) return null;
  return <span className={`tag tag-${kind.toLowerCase()}`}>{kind}</span>;
}
