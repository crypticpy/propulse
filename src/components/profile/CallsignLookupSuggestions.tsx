/**
 * CallsignLookupSuggestions
 *
 * Rich auto-fill card showing multi-source callsign ingestion results.
 * Each discovered field is a checkbox row with conflict detection —
 * fields where the user already has a value are unchecked by default.
 * Source badges (QRZ / HamQTH / Callook) indicate data provenance.
 *
 * Includes an inline QRZ API Key input when QRZ isn't configured,
 * so users can easily enable bio/image lookups.
 */

import { useState, useCallback, useEffect } from "react";
import { useProfileStore } from "@/stores/profileStore";
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
  | "imageUrl"
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
    key: "imageUrl",
    label: "Photo",
    getValue: (r) =>
      r.imageUrl
        ? r.imageUrl.length > 60
          ? r.imageUrl.slice(0, 60) + "..."
          : r.imageUrl
        : undefined,
    getCurrentValue: () => undefined,
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

  // QRZ API key state
  const qrzApiKey = useProfileStore((s) => s.serviceCredentials.qrz?.apiKey);
  const setServiceCredentials = useProfileStore((s) => s.setServiceCredentials);
  const [showQrzInput, setShowQrzInput] = useState(false);
  const [qrzKeyDraft, setQrzKeyDraft] = useState("");

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

  // Re-initialize when result appears; reset when result clears
  useEffect(() => {
    if (result && !initialized) {
      initSelection(result);
    }
    if (!result && initialized) {
      setInitialized(false);
    }
  }, [result, initialized, initSelection]);

  const toggleField = (key: IngestionField) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSaveQrzKey = () => {
    const trimmed = qrzKeyDraft.trim();
    if (trimmed) {
      setServiceCredentials({ qrz: { apiKey: trimmed } });
      setShowQrzInput(false);
      setQrzKeyDraft("");
    }
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

  const hasQrz = result.sources.includes("qrz");
  const hasHamqth = result.sources.includes("hamqth");
  const missingRichSources = !hasQrz && !hasHamqth;

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
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
                     text-gray-400 hover:text-white bg-white/5 hover:bg-white/10
                     border border-white/10 hover:border-white/20 transition-colors"
          aria-label="Dismiss suggestions"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
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

      {/* QRZ API Key prompt — shown when QRZ isn't in sources and no key configured */}
      {missingRichSources && !qrzApiKey && (
        <div className="mt-2 pt-2 border-t border-white/5">
          {!showQrzInput ? (
            <button
              type="button"
              onClick={() => setShowQrzInput(true)}
              className="text-xs text-nebula-blue hover:text-nebula-blue/80 transition-colors"
            >
              + Add QRZ API key for bio, image &amp; more data
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={qrzKeyDraft}
                onChange={(e) => setQrzKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveQrzKey()}
                placeholder="QRZ XML API key"
                className="flex-1 bg-void-black border border-white/10 rounded px-2 py-1 text-xs
                           text-gray-200 placeholder-gray-600 focus:border-nebula-blue/50 focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveQrzKey}
                disabled={!qrzKeyDraft.trim()}
                className="px-2 py-1 text-xs rounded bg-nebula-blue/20 text-nebula-blue
                           border border-nebula-blue/30 hover:bg-nebula-blue/30 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowQrzInput(false);
                  setQrzKeyDraft("");
                }}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

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
