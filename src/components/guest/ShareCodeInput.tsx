/**
 * ShareCodeInput - Formatted share code input with auto-uppercase
 */

import { useCallback } from "react";
import { formatShareCode } from "@/lib/utils/shareCode";

export interface ShareCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
}

export function ShareCodeInput({
  value,
  onChange,
  error,
  disabled,
}: ShareCodeInputProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatShareCode(e.target.value);
      onChange(formatted);
    },
    [onChange],
  );

  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="ABC-123"
        maxLength={7}
        disabled={disabled}
        className={`
          w-full px-4 py-3 bg-deep-space border rounded-lg
          text-white placeholder-gray-500 font-mono text-xl text-center tracking-widest
          focus:outline-none focus:ring-2 focus:ring-offset-0
          disabled:opacity-50 disabled:cursor-not-allowed
          ${
            error
              ? "border-alert-red/50 focus:border-alert-red focus:ring-alert-red/30"
              : "border-white/10 focus:border-plasma-orange/50 focus:ring-plasma-orange/30"
          }
        `}
        aria-invalid={!!error}
      />
      {error && <p className="mt-1 text-sm text-alert-red">{error}</p>}
    </div>
  );
}

export default ShareCodeInput;
