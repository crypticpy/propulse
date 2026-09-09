export function SettingSlider({
  id,
  label,
  description,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className="text-sm font-medium text-su-muted">
          {label}
        </label>
        <span className="text-sm text-su-muted font-mono">{displayValue}</span>
      </div>
      <input
        id={id}
        type="range"
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={displayValue}
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-void-black rounded-lg appearance-none cursor-pointer accent-plasma-orange disabled:opacity-40 disabled:cursor-not-allowed"
      />
      {description && (
        <p className="text-xs text-su-muted mt-1">{description}</p>
      )}
    </div>
  );
}
