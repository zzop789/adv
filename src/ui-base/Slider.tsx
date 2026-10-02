import type { CSSProperties } from 'react';

export interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  valueText?: string;
  onValueChange: (value: number) => void;
  className?: string;
  style?: CSSProperties;
}

/** A controlled range input. Invalid bounds and values never reach the DOM. */
export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  valueText,
  onValueChange,
  className = '',
  style,
}: SliderProps) {
  const lower = Number.isFinite(min) ? min : 0;
  const upper = Number.isFinite(max) ? Math.max(lower, max) : lower;
  const clamp = (candidate: number) => Math.min(upper, Math.max(lower, candidate));
  const safeValue = Number.isFinite(value) ? clamp(value) : lower;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const inactive = disabled || lower === upper;
  return <input
    type="range"
    className={`ui-slider ${className}`.trim()}
    style={style}
    aria-label={label}
    aria-valuetext={valueText}
    min={lower}
    max={upper}
    step={safeStep}
    value={safeValue}
    disabled={inactive}
    onChange={(event) => {
      const candidate = event.currentTarget.valueAsNumber;
      if (!inactive && Number.isFinite(candidate)) onValueChange(clamp(candidate));
    }}
  />;
}
