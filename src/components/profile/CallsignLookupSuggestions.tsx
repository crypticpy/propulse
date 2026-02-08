/**
 * CallsignLookupSuggestions
 *
 * Rich auto-fill card showing multi-source callsign ingestion results.
 * Each discovered field is a checkbox row with conflict detection —
 * fields where the user already has a value are unchecked by default.
 * Source badges (QRZ / HamQTH / Callook) indicate data provenance.
 */

import { useState, useCallback } from "react";
import type { IngestionResult } from "@/hooks/useCallsignIngestion";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Fields that can be selectively auto-filled */
export type IngestionField =
  | "name"
  | "grid"
  | "country"
  | "licenseClass"
  | "grantDate"
  | "expiryDate"
  | "licenseId"
  | "bio"
  | "latLon";

export interface CurrentValues {
  name?: string;
  grid?: string;
  country?: string;
  licenseClass?: string;
  bio?: string;
  lat?: number;
  lon?: number;
}

interface Props {
  result: IngestionResult | null;
  loading: boolean;
  currentValues: CurrentValues;
  onApply: (
    result: IngestionResult,
    selectedFields: Set<IngestionField>,
  ) => void;
  onDismiss: () => void;
}

// ─── Field definitions ──────────────────────────────────────────────────────

interface FieldDef {
  key: IngestionField;
  label: string;
  getValue: (r: IngestionResult) => string | undefined;
  getCurrentValue: (c: CurrentValues) => string | undefined;
}

const FIELD_DEFS: FieldDef[] = [
  {
    key: "name",
    label: "Name",
    getValue: (r) => r.name,
    getCurrentValue: (c) => c.name,
  },
  {
    key: "grid",
    label: "Grid",
    getValue: (r) => r.grid,
    getCurrentValue: (c) => c.grid,
  },
  {
    key: "country",
    label: "Country",
    getValue: (r) => r.country,
    getCurrentValue: (c) => c.country,
  },
  {
    key: "licenseClass",
    label: "License",
    getValue: (r) => {
      const parts: string[] = [];
      if (r.licenseClass) parts.push(r.licenseClass);
      if (r.expiryDate) parts.push(`exp ${r.expiryDate}`);
      return parts.length > 0 ? parts.join(" — ") : undefined;
    },
    getCurrentValue: (c) => c.licenseClass,
  },
  {
    key: "bio",
    label: "Bio",
    getValue: (r) =>
      r.bio
        ? r.bio.length > 80
          ? r.bio.slice(0, 80) + "..."
          : r.bio
        : undefined,
    getCurrentValue: (c) =>
      c.bio
        ? c.bio.length > 40
          ? c.bio.slice(0, 40) + "..."
          : c.bio
        : undefined,
  },
  {
    key: "latLon",
    label: "Location",
    getValue: (r) =>
      r.lat != null && r.lon != null
        ? `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`
        : undefined,
    getCurrentValue: (c) =>
      c.lat != null && c.lon != null && (c.lat !== 0 || c.lon !== 0)
        ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`
        : undefined,
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function CallsignLookupSuggestions({
  result,
  loading,
  currentValues,
  onApply,
  onDismiss,
}: Props) {
  // Track which fields the user has checked
  const [selected, setSelected] = useState<Set<IngestionField>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Initialize selection when result changes
  const initSelection = useCallback(
    (r: IngestionResult) => {
      const auto = new Set<IngestionField>();
      for (const def of FIELD_DEFS) {
        const newVal = def.getValue(r);
        if (!newVal) continue;
        const curVal = def.getCurrentValue(currentValues);
        // Auto-check if the user has no existing value
        if (!curVal) auto.add(def.key);
      }
      setSelected(auto);
      setInitialized(true);
    },
    [currentValues],
  );

  // Re-initialize when result appears
  if (result && !initialized) {
    initSelection(result);
  }

  // Reset initialization when result clears
  if (!result && initialized) {
    setInitialized(false);
  }

  const toggleField = (key: IngestionField) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="mt-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <LoadingDots />
          <span>Looking up callsign...</span>
        </div>
      </div>
    );
  }

  if (!result) return null;

  // Filter to fields that have new values
  const availableFields = FIELD_DEFS.filter((def) => def.getValue(result));
  if (availableFields.length === 0) return null;

  return (
    <div className="mt-2 px-3 py-2.5 bg-signal-green/5 border border-signal-green/20 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-signal-green uppercase tracking-wider">
            Callbook Data Found
          </p>
          <SourceBadges sources={result.sources} />
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Dismiss suggestions"
        >
          Dismiss
        </button>
      </div>

      {/* Field checkboxes */}
      <div className="space-y-1.5">
        {availableFields.map((def) => {
          const newVal = def.getValue(result)!;
          const curVal = def.getCurrentValue(currentValues);
          const hasConflict = !!curVal;
          const isChecked = selected.has(def.key);

          return (
            <label
              key={def.key}
              className="flex items-start gap-2 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleField(def.key)}
                className="mt-0.5 rounded border-white/20 bg-white/5 text-signal-green
                           focus:ring-signal-green/30 focus:ring-offset-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14 shrink-0">
                    {def.label}
                  </span>
                  <span className="text-sm text-gray-200 truncate">
                    {newVal}
                  </span>
                </div>
                {hasConflict && (
                  <p className="text-xs text-caution-amber/70 mt-0.5 ml-14">
                    Current: {curVal}
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {/* Apply button */}
      <div className="mt-2.5 flex justify-end">
        <button
          type="button"
          onClick={() => onApply(result, selected)}
          disabled={selected.size === 0}
          className="px-3 py-1 text-xs font-medium rounded bg-signal-green/20 text-signal-green
                     border border-signal-green/30 hover:bg-signal-green/30 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply Selected ({selected.size})
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SourceBadges({ sources }: { sources: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {sources.map((s) => (
        <span
          key={s}
          className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded
                     bg-white/5 text-gray-500 border border-white/5"
        >
          {s}
        </span>
      ))}
    </span>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse [animation-delay:300ms]" />
    </span>
  );
}
