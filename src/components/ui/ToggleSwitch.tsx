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
            ${checked ? "bg-plasma-orange" : "bg-white/10"}
            ${disabled ? "cursor-not-allowed" : "cursor-pointer"}
          `}
        >
          <span
            className={`
              absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform
              ${checked ? "translate-x-4" : "translate-x-0"}
            `}
          />
        </button>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-200">{label}</div>
        {description && (
          <div className="text-xs text-gray-500 mt-0.5">{description}</div>
        )}
      </div>
    </label>
  );
}
