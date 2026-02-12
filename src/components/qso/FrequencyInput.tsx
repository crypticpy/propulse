/**
 * FrequencyInput — Frequency entry with automatic band detection.
 *
 * Shows a derived band badge next to the frequency input.
 * Frequency is in kHz (e.g., 14074 for 20m FT8).
 */

import { bandFromFreq } from "@/lib/utils/bandFromFreq";

export interface FrequencyInputProps {
  value: number;
  onChange: (value: number) => void;
  band: string;
  /** Whether frequency was set from rig bridge, not manual entry */
  autoFilled?: boolean;
}

export function FrequencyInput({
  value,
  onChange,
  band,
  autoFilled = false,
}: FrequencyInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      onChange(0);
      return;
    }
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      onChange(Math.max(0, parsed));
    }
  };

  // Derive band for the badge display
  const derivedBand = value > 0 ? bandFromFreq(value) : null;
  const displayBand = band || derivedBand || "";

  return (
    <div className="relative flex items-center gap-2">
      <div className="relative flex-1">
        <input
          id="qso-frequency"
          aria-label="Frequency in kHz"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          value={value > 0 ? value : ""}
          onChange={handleChange}
          placeholder="14074"
          className={`
            w-full h-12 px-3
            bg-white/5 border rounded-lg
            text-white text-base font-mono
            placeholder-gray-500
            focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
            focus:outline-none
            transition-colors
            [appearance:textfield]
            [&::-webkit-inner-spin-button]:appearance-none
            [&::-webkit-outer-spin-button]:appearance-none
            ${autoFilled ? "border-l-2 border-l-signal-green border-white/10" : "border-white/10"}
          `}
          style={{ fontSize: "16px" }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
          kHz
        </span>
      </div>

      {/* Band badge */}
      {displayBand && (
        <span
          className="
            inline-flex items-center justify-center
            h-7 px-2.5 rounded-full
            text-xs font-mono font-medium
            bg-plasma-orange/15 text-plasma-orange
            border border-plasma-orange/25
            whitespace-nowrap shrink-0
          "
          aria-label={`Band: ${displayBand}`}
        >
          {displayBand}
        </span>
      )}
    </div>
  );
}
