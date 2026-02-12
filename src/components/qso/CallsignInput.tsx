/**
 * CallsignInput — Smart callsign input with uppercase transform,
 * clear button, and loading indicator during lookup.
 *
 * Auto-focuses on mount.
 */

import { useEffect, useRef } from "react";

export interface CallsignInputProps {
  value: string;
  onChange: (value: string) => void;
  lookupLoading: boolean;
  /** Whether the value was auto-filled from a lookup source */
  autoFilled?: boolean;
}

export function CallsignInput({
  value,
  onChange,
  lookupLoading,
  autoFilled = false,
}: CallsignInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value.toUpperCase());
  };

  const handleClear = () => {
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={inputRef}
        id="qso-callsign"
        aria-label="Callsign"
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="W1AW"
        autoComplete="off"
        spellCheck={false}
        className={`
          w-full h-12 px-3 pr-10
          bg-white/5 border rounded-lg
          text-white text-base font-mono uppercase
          placeholder-gray-500
          focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
          focus:outline-none
          transition-colors
          ${autoFilled ? "border-l-2 border-l-signal-green border-white/10" : "border-white/10"}
        `}
        style={{ fontSize: "16px" }}
      />

      {/* Loading spinner */}
      {lookupLoading && (
        <div className="absolute right-9 top-1/2 -translate-y-1/2">
          <svg
            className="animate-spin h-4 w-4 text-plasma-orange"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      )}

      {/* Clear button */}
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear callsign"
          className="
            absolute right-2 top-1/2 -translate-y-1/2
            w-7 h-7 flex items-center justify-center
            rounded-md text-gray-400 hover:text-white hover:bg-white/10
            transition-colors
          "
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M1 1L13 13M1 13L13 1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
