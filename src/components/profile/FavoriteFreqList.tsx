/**
 * Editable list of favorite monitoring frequencies.
 * Read mode shows a compact list; edit mode adds remove buttons and an add form.
 */

import { useState } from "react";
import { TuneButton } from "@/components/radio/TuneButton";
import { parseFrequencyKHz } from "@/lib/radio/frequency";
import type { FavoriteFrequency } from "@/types/social";

interface FavoriteFreqListProps {
  freqs: FavoriteFrequency[];
  editable?: boolean;
  onAdd?: (freq: Omit<FavoriteFrequency, "id">) => void;
  onRemove?: (id: string) => void;
}

const MAX_FREQS = 10;

const MODE_OPTIONS = [
  "SSB",
  "CW",
  "FT8",
  "FT4",
  "FM",
  "AM",
  "RTTY",
  "PSK31",
  "JS8",
  "SSTV",
  "Other",
] as const;

/** Auto-detect band from frequency in MHz */
function detectBand(freqMhz: string): string {
  const f = freqMhz.trim();
  if (f.startsWith("1.8") || f.startsWith("1.9")) return "160m";
  if (
    f.startsWith("3.5") ||
    f.startsWith("3.6") ||
    f.startsWith("3.7") ||
    f.startsWith("3.8") ||
    f.startsWith("3.9") ||
    f.startsWith("4.0")
  )
    return "80m";
  if (f.startsWith("5.3") || f.startsWith("5.4")) return "60m";
  if (f.startsWith("7.")) return "40m";
  if (f.startsWith("10.")) return "30m";
  if (f.startsWith("14.")) return "20m";
  if (f.startsWith("18.")) return "17m";
  if (f.startsWith("21.")) return "15m";
  if (f.startsWith("24.")) return "12m";
  if (f.startsWith("28.") || f.startsWith("29.")) return "10m";
  if (
    f.startsWith("50.") ||
    f.startsWith("51.") ||
    f.startsWith("52.") ||
    f.startsWith("53.") ||
    f.startsWith("54.")
  )
    return "6m";
  if (
    f.startsWith("144.") ||
    f.startsWith("145.") ||
    f.startsWith("146.") ||
    f.startsWith("147.") ||
    f.startsWith("148.")
  )
    return "2m";
  if (
    f.startsWith("430.") ||
    f.startsWith("440.") ||
    f.startsWith("432.") ||
    f.startsWith("433.") ||
    f.startsWith("438.")
  )
    return "70cm";
  return "?";
}

export function FavoriteFreqList({
  freqs,
  editable = false,
  onAdd,
  onRemove,
}: FavoriteFreqListProps) {
  const [frequency, setFrequency] = useState("");
  const [mode, setMode] = useState("SSB");
  const [notes, setNotes] = useState("");

  const detectedBand = detectBand(frequency);

  const handleAdd = () => {
    if (!frequency.trim() || !onAdd) return;
    if (freqs.length >= MAX_FREQS) return;

    onAdd({
      band: detectedBand !== "?" ? detectedBand : "Unknown",
      frequency: frequency.trim(),
      mode: mode || undefined,
      notes: notes.trim() || undefined,
    });

    setFrequency("");
    setMode("SSB");
    setNotes("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  if (freqs.length === 0 && !editable) {
    return (
      <p className="text-su-muted text-xs italic">No favorite frequencies</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Frequency list */}
      {freqs.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-2 group text-xs">
          {/* Frequency */}
          <span className="font-mono text-su-text shrink-0">
            {f.frequency} MHz
          </span>

          {/* Mode pill */}
          {f.mode && (
            <span className="shrink-0 rounded-full bg-su-line/10 border border-su-line/40 px-1.5 py-0.5 text-xs text-su-muted">
              {f.mode}
            </span>
          )}

          {/* Band */}
          <span className="text-su-muted shrink-0">{f.band}</span>

          {/* Notes */}
          {f.notes && (
            <>
              <span className="text-su-muted">—</span>
              <span className="text-su-muted italic truncate">{f.notes}</span>
            </>
          )}

          <TuneButton
            frequencyKHz={parseFrequencyKHz(f.frequency)}
            mode={f.mode && f.mode !== "Other" ? f.mode : null}
            wall={false}
          />

          {/* Remove button */}
          {editable && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(f.id)}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-red-400/70 hover:text-red-400 text-xs shrink-0"
              aria-label={`Remove ${f.frequency} MHz`}
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {/* Add form */}
      {editable && freqs.length < MAX_FREQS && (
        <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-su-line/20">
          {/* Frequency input */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs uppercase tracking-widest text-su-muted">
              Freq (MHz)
            </label>
            <input
              type="text"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="14.250"
              className="w-24 bg-su-line/10 border border-su-line/40 rounded px-2 py-1 text-xs text-su-text placeholder:text-su-muted/80 focus:outline-none focus:border-su-line/50 font-mono"
            />
          </div>

          {/* Auto-detected band */}
          {frequency && (
            <span className="text-xs text-su-muted pb-1">
              {detectedBand !== "?" ? detectedBand : "—"}
            </span>
          )}

          {/* Mode select */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs uppercase tracking-widest text-su-muted">
              Mode
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="bg-su-line/10 border border-su-line/40 rounded px-2 py-1 text-xs text-su-text focus:outline-none focus:border-su-line/50"
            >
              {MODE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Notes input */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs uppercase tracking-widest text-su-muted">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Daily ragchew"
              className="w-32 bg-su-line/10 border border-su-line/40 rounded px-2 py-1 text-xs text-su-text placeholder:text-su-muted/80 focus:outline-none focus:border-su-line/50"
            />
          </div>

          {/* Add button */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={!frequency.trim() || detectedBand === "?"}
            className="bg-su-line/10 hover:bg-su-line/20 disabled:opacity-30 disabled:cursor-not-allowed border border-su-line/40 rounded px-3 py-1 text-xs text-su-text transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {/* Max reached */}
      {editable && freqs.length >= MAX_FREQS && (
        <p className="text-xs text-su-muted italic pt-1">
          Maximum of {MAX_FREQS} frequencies reached
        </p>
      )}
    </div>
  );
}
