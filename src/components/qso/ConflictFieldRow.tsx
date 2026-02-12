/**
 * ConflictFieldRow — Per-field diff view with radio-button resolution.
 *
 * Shows local vs. remote values side-by-side with colour coding
 * and lets the user pick which value to keep (or merge for text fields).
 */

import { useState } from "react";

// ── Field label mapping ─────────────────────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  callsign: "Callsign",
  frequency: "Frequency",
  mode: "Mode",
  band: "Band",
  date: "Date",
  timeOn: "Time On",
  timeOff: "Time Off",
  rstSent: "RST Sent",
  rstRcvd: "RST Received",
  grid: "Grid Square",
  name: "Name",
  qth: "QTH",
  notes: "Notes",
  txPower: "TX Power",
  myGrid: "My Grid",
  propMode: "Propagation Mode",
  mySig: "My Program",
  mySigInfo: "My Reference",
  sig: "Their Program",
  sigInfo: "Their Reference",
  contestId: "Contest ID",
  srx: "Serial Received",
  stx: "Serial Sent",
};

/** Fields that support custom merge (free-text) */
const MERGEABLE_FIELDS = new Set(["notes", "qth", "name"]);

// ── Types ───────────────────────────────────────────────────────────────────

export type FieldResolution = "local" | "remote" | "merged";

export interface ConflictFieldRowProps {
  /** Internal field key (e.g. "rstSent") */
  field: string;
  /** Human-readable label override (optional — falls back to FIELD_LABELS) */
  label?: string;
  /** Value on this device */
  localValue: unknown;
  /** Value from the other device */
  remoteValue: unknown;
  /** Currently selected resolution */
  resolution: FieldResolution;
  /** Called when the user picks a resolution */
  onResolve: (resolution: FieldResolution) => void;
  /** Current custom merge text (only for mergeable fields) */
  mergedValue?: string;
  /** Called when the user edits the merged text */
  onMergedValueChange?: (value: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function displayValue(value: unknown): string {
  if (value == null) return "\u2014";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const str = String(value).trim();
  return str || "\u2014";
}

// ── Component ───────────────────────────────────────────────────────────────

export function ConflictFieldRow({
  field,
  label,
  localValue,
  remoteValue,
  resolution,
  onResolve,
  mergedValue,
  onMergedValueChange,
}: ConflictFieldRowProps) {
  const [showMergeInput, setShowMergeInput] = useState(resolution === "merged");
  const humanLabel = label ?? FIELD_LABELS[field] ?? field;
  const isMergeable = MERGEABLE_FIELDS.has(field);

  const handleSelectMerge = () => {
    setShowMergeInput(true);
    onResolve("merged");
    // Pre-fill with concatenation if no merged value yet
    if (!mergedValue && onMergedValueChange) {
      const l = displayValue(localValue);
      const r = displayValue(remoteValue);
      const parts = [l, r].filter((v) => v !== "\u2014");
      onMergedValueChange(parts.join(" | "));
    }
  };

  return (
    <div className="space-y-2">
      {/* Field label */}
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {humanLabel}
      </p>

      {/* Two-column local vs remote */}
      <div className="grid grid-cols-2 gap-3">
        {/* Local value */}
        <button
          type="button"
          onClick={() => {
            setShowMergeInput(false);
            onResolve("local");
          }}
          className={[
            "flex items-start gap-2 rounded-lg border p-3 text-left transition-all",
            resolution === "local"
              ? "border-signal-green/50 ring-2 ring-signal-green bg-nebula-blue/10"
              : "border-nebula-blue/30 bg-nebula-blue/5 hover:bg-nebula-blue/10",
          ].join(" ")}
        >
          <span
            className={[
              "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors",
              resolution === "local"
                ? "border-signal-green bg-signal-green"
                : "border-gray-500 bg-transparent",
            ].join(" ")}
          />
          <span className="font-mono text-sm text-white break-all">
            {displayValue(localValue)}
          </span>
        </button>

        {/* Remote value */}
        <button
          type="button"
          onClick={() => {
            setShowMergeInput(false);
            onResolve("remote");
          }}
          className={[
            "flex items-start gap-2 rounded-lg border p-3 text-left transition-all",
            resolution === "remote"
              ? "border-signal-green/50 ring-2 ring-signal-green bg-plasma-orange/10"
              : "border-plasma-orange/30 bg-plasma-orange/5 hover:bg-plasma-orange/10",
          ].join(" ")}
        >
          <span
            className={[
              "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors",
              resolution === "remote"
                ? "border-signal-green bg-signal-green"
                : "border-gray-500 bg-transparent",
            ].join(" ")}
          />
          <span className="font-mono text-sm text-white break-all">
            {displayValue(remoteValue)}
          </span>
        </button>
      </div>

      {/* Merge option (text fields only) */}
      {isMergeable && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleSelectMerge}
            className={[
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all w-full",
              resolution === "merged"
                ? "border-signal-green/50 ring-2 ring-signal-green bg-signal-green/5"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
            ].join(" ")}
          >
            <span
              className={[
                "h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors",
                resolution === "merged"
                  ? "border-signal-green bg-signal-green"
                  : "border-gray-500 bg-transparent",
              ].join(" ")}
            />
            <span className="text-gray-300">Merge both values</span>
          </button>

          {showMergeInput && resolution === "merged" && (
            <textarea
              value={mergedValue ?? ""}
              onChange={(e) => onMergedValueChange?.(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white placeholder-gray-500 focus:border-signal-green/50 focus:outline-none focus:ring-1 focus:ring-signal-green/50"
              placeholder="Type merged value..."
            />
          )}
        </div>
      )}
    </div>
  );
}
