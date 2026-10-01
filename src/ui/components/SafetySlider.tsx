interface Props {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  label: string;
  disabled?: boolean;
}

/** Track with a block thumb, plus a numeric stepper. */
export function SafetySlider({ value, min = 0, max = 30, onChange, label, disabled }: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="slider">
      <button
        type="button"
        className="slider-step"
        aria-label={`${label}: decrease`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        {'−'}
      </button>
      <span className="slider-val" aria-live="off">
        {value}%
      </span>
      <button
        type="button"
        className="slider-step"
        aria-label={`${label}: increase`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </button>
      <div className="slider-range">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
        />
        <div className="slider-ends" aria-hidden="true">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}
