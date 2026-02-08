/**
 * StationIdentityForm -- Shared form for callsign, operator name, and grid locator.
 *
 * Used in:
 * - Desktop sidebar (compact edit mode)
 * - Desktop overview tab
 * - Mobile overview tab
 *
 * Includes callsign auto-fill: when a callsign >= 3 chars is entered,
 * queries HamQTH and shows suggestions the user can apply with one click.
 */

import { useState, useEffect, useCallback } from "react";
import { LocationInput } from "@/components/settings/LocationInput";
import { useCallsignAutoFill } from "@/hooks/useCallsignAutoFill";
import type { CallsignSuggestion } from "@/hooks/useCallsignAutoFill";
import { CallsignLookupSuggestions } from "./CallsignLookupSuggestions";

export interface StationIdentityFormProps {
  callsign: string;
  setCallsign: (v: string) => void;
  operatorName: string;
  setOperatorName: (v: string) => void;
  grid: string;
  setGrid: (v: string) => void;
  isDirty: boolean;
  handleSave: () => void;
  callsignError: string | null;
  setCallsignError: (v: string | null) => void;
  gridError: string | null;
  setGridError: (v: string | null) => void;
  /** Render compact layout for sidebar inline edit */
  compact?: boolean;
  /** Optional id prefix for label htmlFor (e.g. "mobile", "profile") */
  idPrefix?: string;
  /** Hide the built-in save button (when parent provides its own) */
  hideSaveButton?: boolean;
}

export function StationIdentityForm({
  callsign,
  setCallsign,
  operatorName,
  setOperatorName,
  grid,
  setGrid,
  isDirty,
  handleSave,
  callsignError,
  setCallsignError,
  gridError,
  setGridError,
  compact = false,
  idPrefix = "profile",
  hideSaveButton = false,
}: StationIdentityFormProps) {
  const spacing = compact ? "space-y-3" : "space-y-4";
  const labelClass = compact
    ? "block text-xs font-medium text-gray-400 mb-1"
    : "block text-sm font-medium text-gray-300 mb-1";
  const gridLabelClass = compact
    ? "block text-xs font-medium text-gray-400 mb-1"
    : "block text-sm font-medium text-gray-300 mb-2";

  // Callsign auto-fill
  const { suggestion, loading } = useCallsignAutoFill(callsign);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when callsign changes
  useEffect(() => {
    setDismissed(false);
  }, [callsign]);

  const handleAutoFill = useCallback(
    (s: CallsignSuggestion) => {
      if (s.name) setOperatorName(s.name);
      if (s.grid) setGrid(s.grid);
      setDismissed(true);
    },
    [setOperatorName, setGrid],
  );

  return (
    <div className={spacing}>
      {/* Callsign */}
      <div>
        <label htmlFor={`${idPrefix}-callsign`} className={labelClass}>
          Callsign
        </label>
        <input
          type="text"
          id={`${idPrefix}-callsign`}
          value={callsign}
          onChange={(e) => {
            setCallsign(e.target.value.toUpperCase());
            setCallsignError(null);
          }}
          placeholder="N5XXX"
          className={`w-full bg-void-black border rounded-lg px-3 py-2 text-sm text-gray-200
                     font-mono focus:border-plasma-orange/50 focus:outline-none
                     ${callsignError ? "border-alert-red/50" : "border-white/10"}`}
        />
        {callsignError && (
          <p className="mt-1 text-xs text-alert-red">{callsignError}</p>
        )}

        {/* Auto-fill suggestions from HamQTH lookup */}
        {!dismissed && (
          <CallsignLookupSuggestions
            suggestion={suggestion}
            loading={loading}
            onAutoFill={handleAutoFill}
            onDismiss={() => setDismissed(true)}
          />
        )}
      </div>

      {/* Operator Name */}
      <div>
        <label htmlFor={`${idPrefix}-name`} className={labelClass}>
          Operator Name
          {!compact && (
            <span className="ml-1 text-xs text-gray-500 font-normal">
              (optional)
            </span>
          )}
        </label>
        <input
          type="text"
          id={`${idPrefix}-name`}
          value={operatorName}
          onChange={(e) => setOperatorName(e.target.value)}
          placeholder="John"
          className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200
                     focus:border-plasma-orange/50 focus:outline-none"
        />
      </div>

      {/* Grid Locator */}
      <div>
        <label className={gridLabelClass}>
          {compact ? "Grid Locator" : "Home Grid Square"}
        </label>
        <LocationInput
          value={grid}
          onChange={(v) => {
            setGrid(v);
          }}
          error={gridError}
          onError={setGridError}
        />
      </div>

      {/* Save button (hidden when parent provides its own) */}
      {isDirty && !hideSaveButton && (
        <div className={compact ? "" : "pt-2"}>
          <button
            type="button"
            onClick={handleSave}
            className={`bg-plasma-orange hover:bg-plasma-orange/80 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              compact ? "w-full" : ""
            }`}
          >
            Save Profile
          </button>
        </div>
      )}
    </div>
  );
}
