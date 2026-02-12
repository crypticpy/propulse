/**
 * QSOEntryCompact — Minimal inline QSO entry form.
 *
 * Single row: callsign + frequency + mode + LOG button.
 * For embedding in dashboard headers, logbook sidebars, etc.
 * Uses quickLog for one-tap logging.
 */

import { useState, useCallback } from "react";
import { useQSOStore } from "@/stores/qsoStore";

export interface QSOEntryCompactProps {
  /** Callback after a QSO is successfully logged */
  onQSOLogged?: (id: string) => void;
}

export function QSOEntryCompact({ onQSOLogged }: QSOEntryCompactProps) {
  const form = useQSOStore((s) => s.form);
  const setField = useQSOStore((s) => s.setField);
  const quickLog = useQSOStore((s) => s.quickLog);

  const [isLogging, setIsLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);

  const handleLog = useCallback(async () => {
    const callsign = form.callsign.trim().toUpperCase();
    if (!callsign) return;
    if (isLogging) return;

    setIsLogging(true);
    try {
      const id = await quickLog(callsign);
      if (id) {
        setLogSuccess(true);
        onQSOLogged?.(id);
        setTimeout(() => setLogSuccess(false), 600);
      }
    } finally {
      setIsLogging(false);
    }
  }, [form.callsign, isLogging, quickLog, onQSOLogged]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleLog();
      }
    },
    [handleLog],
  );

  const canLog = form.callsign.trim().length > 0;

  return (
    <div
      className="flex items-center gap-2"
      role="form"
      aria-label="Quick QSO entry"
    >
      {/* Callsign */}
      <input
        id="qso-compact-callsign"
        aria-label="Callsign"
        type="text"
        value={form.callsign}
        onChange={(e) => setField("callsign", e.target.value.toUpperCase())}
        onKeyDown={handleKeyDown}
        placeholder="Callsign"
        autoComplete="off"
        spellCheck={false}
        className="
          h-9 w-28 px-2
          bg-white/5 border border-white/10 rounded-lg
          text-white text-sm font-mono uppercase
          placeholder-gray-500
          focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
          focus:outline-none
        "
        style={{ fontSize: "16px" }}
      />

      {/* Frequency */}
      <input
        id="qso-compact-frequency"
        aria-label="Frequency in kHz"
        type="number"
        inputMode="decimal"
        step="0.1"
        min="0"
        value={form.frequency > 0 ? form.frequency : ""}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          setField("frequency", isNaN(val) ? 0 : val);
        }}
        onKeyDown={handleKeyDown}
        placeholder="kHz"
        className="
          h-9 w-24 px-2
          bg-white/5 border border-white/10 rounded-lg
          text-white text-sm font-mono
          placeholder-gray-500
          focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
          focus:outline-none
          [appearance:textfield]
          [&::-webkit-inner-spin-button]:appearance-none
          [&::-webkit-outer-spin-button]:appearance-none
        "
        style={{ fontSize: "16px" }}
      />

      {/* Mode */}
      <select
        id="qso-compact-mode"
        aria-label="Operating mode"
        value={form.mode}
        onChange={(e) => setField("mode", e.target.value)}
        className="
          h-9 w-20 px-1.5
          bg-white/5 border border-white/10 rounded-lg
          text-white text-sm font-mono
          focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
          focus:outline-none appearance-none cursor-pointer
        "
        style={{ fontSize: "16px" }}
      >
        <option value="" className="bg-deep-space text-gray-400">
          Mode
        </option>
        {["SSB", "CW", "FT8", "FT4", "FM", "AM", "RTTY", "PSK31", "JS8"].map(
          (mode) => (
            <option
              key={mode}
              value={mode}
              className="bg-deep-space text-white"
            >
              {mode}
            </option>
          ),
        )}
      </select>

      {/* LOG button */}
      <button
        type="button"
        onClick={handleLog}
        disabled={!canLog || isLogging}
        aria-label="Quick log QSO"
        className={`
          h-9 px-4 rounded-lg font-bold text-xs
          transition-all duration-200 whitespace-nowrap shrink-0
          ${
            logSuccess
              ? "bg-signal-green text-white"
              : canLog
                ? "bg-plasma-orange hover:bg-plasma-orange/80 text-white active:scale-95"
                : "bg-white/5 text-gray-500 cursor-not-allowed"
          }
        `}
      >
        {isLogging ? (
          <svg
            className="animate-spin h-4 w-4"
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
        ) : logSuccess ? (
          "OK"
        ) : (
          "LOG"
        )}
      </button>
    </div>
  );
}
