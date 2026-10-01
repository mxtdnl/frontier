interface Props {
  label: string;
  /** 0 to 1. */
  value: number;
  text: string;
  tone?: 'wire' | 'signal' | 'dim' | 'down';
  /** Optional marker position, 0 to 1. */
  marker?: number;
  labelW?: number;
  textW?: number;
  describe?: string;
}

export function HBar({ label, value, text, tone = 'wire', marker, labelW = 8, textW = 10, describe }: Props) {
  const pct = `${(Math.min(1, Math.max(0, value)) * 100).toFixed(2)}%`;
  return (
    <div
      className="hbar"
      style={{ ['--hbar-label' as string]: `${labelW}ch`, ['--hbar-text' as string]: `${textW}ch` }}
      role="img"
      aria-label={describe ?? `${label} ${text}`}
    >
      <span>{label}</span>
      <span className="hbar-track">
        <span className={`hbar-fill t-${tone}`} style={{ width: pct }} />
        {marker !== undefined ? <span className="hbar-marker" style={{ left: `${(marker * 100).toFixed(2)}%` }} /> : null}
      </span>
      <span className="hbar-text">{text}</span>
    </div>
  );
}
