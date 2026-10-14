import { Icon } from "./Icon.tsx";

/** Minus / value / plus control for quantities. */
export function Stepper({
  value,
  min = 1,
  max,
  onChange,
  children,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  children?: React.ReactNode;
}) {
  return (
    <span className="stepper">
      <button
        type="button"
        className="secondary"
        aria-label="Minder"
        disabled={value <= min}
        onClick={() => {
          onChange(value - 1);
        }}
      >
        <Icon name="minus" />
      </button>
      <strong>{value}</strong>
      <button
        type="button"
        className="secondary"
        aria-label="Meer"
        disabled={max !== undefined && value >= max}
        onClick={() => {
          onChange(value + 1);
        }}
      >
        <Icon name="plus" />
      </button>
      {children}
    </span>
  );
}
