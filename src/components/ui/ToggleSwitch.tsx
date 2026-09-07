/**
 * ToggleSwitch Component
 *
 * Shared toggle switch with label and optional description.
 * Used across settings panels (Notification, Watch Alert, CAT, etc.).
 */

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
}: ToggleSwitchProps) {
  return (
    <label
      className={`flex items-start gap-3 cursor-pointer ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <div className="flex-shrink-0 pt-0.5">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => !disabled && onChange(!checked)}
          className={`
            relative w-10 h-6 rounded-full transition-colors
            ${checked ? "bg-plasma-orange" : "bg-su-line/20"}
            ${disabled ? "cursor-not-allowed" : "cursor-pointer"}
          `}
        >
          <span
            className={`
              absolute top-1 left-1 w-4 h-4 rounded-full transition-transform
              ${checked ? "bg-su-on-accent translate-x-4" : "bg-su-text translate-x-0"}
            `}
          />
        </button>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-su-text">{label}</div>
        {description && (
          <div className="text-xs text-su-muted mt-0.5">{description}</div>
        )}
      </div>
    </label>
  );
}
