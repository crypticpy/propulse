/**
 * StationIdentityForm -- Shared form for callsign, operator name, and grid locator.
 *
 * Used in:
 * - Desktop sidebar (compact edit mode)
 * - Desktop overview tab
 * - Mobile overview tab
 *
 * Includes callsign ingestion: when a callsign >= 3 chars is entered,
 * queries Callook + HamQTH + QRZ in parallel and shows a rich auto-fill
 * panel with field-level checkboxes and conflict detection.
 */

import { useState, useCallback, useMemo } from "react";
import { LocationInput } from "@/components/settings/LocationInput";
import { useCallsignIngestion } from "@/hooks/useCallsignIngestion";
import type { IngestionResult } from "@/hooks/useCallsignIngestion";
import { useProfileStore } from "@/stores/profileStore";
import { CallsignLookupSuggestions } from "./CallsignLookupSuggestions";
import type {
  IngestionField,
  CurrentValues,
} from "./CallsignLookupSuggestions";
import {
  buildLookupImport,
  type IdentityImportDraft,
} from "./identityLookupDraft";

const EMPTY_IMPORT: IdentityImportDraft = {};

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
  /** Lookup fields applied into the cancellable draft (not yet saved). */
  importDraft?: IdentityImportDraft;
  onImportDraft?: (draft: IdentityImportDraft) => void;
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
  importDraft = EMPTY_IMPORT,
  onImportDraft,
  compact = false,
  idPrefix = "profile",
  hideSaveButton = false,
}: StationIdentityFormProps) {
  const spacing = compact ? "space-y-3" : "space-y-4";
  const labelClass = compact
    ? "block text-xs font-medium text-su-muted mb-1"
    : "block text-sm font-medium text-su-muted mb-1";
  const gridLabelClass = compact
    ? "block text-xs font-medium text-su-muted mb-1"
    : "block text-sm font-medium text-su-muted mb-2";

  // Multi-source callsign ingestion — only show suggestions for new callsigns
  const lastIngestedCallsign = useProfileStore((s) => s.lastIngestedCallsign);
  const ingestedCallsign =
    importDraft.lastIngestedCallsign || lastIngestedCallsign;
  const alreadyIngested = callsign.trim().toUpperCase() === ingestedCallsign;
  const { result: ingestionResult, loading } = useCallsignIngestion(
    alreadyIngested ? "" : callsign,
  );
  const [dismissed, setDismissed] = useState(false);

  // Build current values for conflict detection (committed + draft)
  const license = useProfileStore((s) => s.license);
  const bio = useProfileStore((s) => s.bio);
  const station = useProfileStore((s) => s.station);

  const currentValues = useMemo<CurrentValues>(
    () => ({
      name: operatorName || undefined,
      grid: grid || undefined,
      country: importDraft.license?.country ?? license?.country,
      licenseClass: importDraft.license?.class ?? license?.class,
      bio: importDraft.bio ?? (bio || undefined),
      lat: importDraft.lat ?? station?.lat,
      lon: importDraft.lon ?? station?.lon,
    }),
    [operatorName, grid, importDraft, license, bio, station?.lat, station?.lon],
  );

  const handleApply = useCallback(
    (result: IngestionResult, selectedFields: Set<IngestionField>) => {
      const built = buildLookupImport(
        result,
        selectedFields,
        callsign,
      );
      if (built.operatorName) setOperatorName(built.operatorName);
      if (built.grid) setGrid(built.grid);
      onImportDraft?.(built.importDraft);
    },
    [callsign, setOperatorName, setGrid, onImportDraft],
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
          className={`w-full bg-void-black border rounded-lg px-3 py-2 text-sm text-su-text
                     font-mono focus:border-plasma-orange/50 focus:outline-none
                     ${callsignError ? "border-alert-red/50" : "border-su-line/40"}`}
        />
        {callsignError && (
          <p className="mt-1 text-xs text-alert-red">{callsignError}</p>
        )}

        {/* Multi-source callsign ingestion suggestions */}
        {!dismissed && (
          <CallsignLookupSuggestions
            result={ingestionResult}
            loading={loading}
            currentValues={currentValues}
            onApply={handleApply}
            onDismiss={() => {
              useProfileStore
                .getState()
                .setLastIngestedCallsign(callsign.trim().toUpperCase());
              setDismissed(true);
            }}
          />
        )}
      </div>

      {/* Operator Name */}
      <div>
        <label htmlFor={`${idPrefix}-name`} className={labelClass}>
          Operator Name
          {!compact && (
            <span className="ml-1 text-xs text-su-muted font-normal">
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
          className="w-full bg-void-black border border-su-line/40 rounded-lg px-3 py-2 text-sm text-su-text
                     focus:border-plasma-orange/50 focus:outline-none"
        />
      </div>

      {/* Grid Locator */}
      <div>
        <span className={gridLabelClass}>
          {compact ? "Grid Locator" : "Home Grid Square"}
        </span>
        <LocationInput
          value={grid}
          onChange={(v) => {
            setGrid(v);
          }}
          error={gridError}
          onError={setGridError}
          compact={compact}
        />
      </div>

      {/* Save button (hidden when parent provides its own) */}
      {isDirty && !hideSaveButton && (
        <div className={compact ? "" : "pt-2"}>
          <button
            type="button"
            onClick={handleSave}
            className={`bg-plasma-orange hover:bg-plasma-orange/80 text-su-on-accent px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
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
