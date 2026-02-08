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

import { useState, useEffect, useCallback, useMemo } from "react";
import { LocationInput } from "@/components/settings/LocationInput";
import { useCallsignIngestion } from "@/hooks/useCallsignIngestion";
import type { IngestionResult } from "@/hooks/useCallsignIngestion";
import { useProfileStore } from "@/stores/profileStore";
import type { LicenseCountry, LicenseClass } from "@/types/user";
import { CallsignLookupSuggestions } from "./CallsignLookupSuggestions";
import type {
  IngestionField,
  CurrentValues,
} from "./CallsignLookupSuggestions";

// ─── Country / License class mapping helpers ────────────────────────────────

const COUNTRY_MAP: Record<string, LicenseCountry> = {
  "united states": "US",
  usa: "US",
  us: "US",
  canada: "CA",
  "united kingdom": "UK",
  uk: "UK",
  "great britain": "UK",
  england: "UK",
  germany: "DE",
  japan: "JP",
  australia: "AU",
  "new zealand": "NZ",
  france: "FR",
  spain: "ES",
  italy: "IT",
  brazil: "BR",
  mexico: "MX",
};

function mapCountry(name: string): LicenseCountry {
  return COUNTRY_MAP[name.toLowerCase().trim()] ?? "OTHER";
}

const LICENSE_CLASS_MAP: Record<string, LicenseClass> = {
  e: "EXTRA",
  extra: "EXTRA",
  a: "ADVANCED",
  advanced: "ADVANCED",
  g: "GENERAL",
  general: "GENERAL",
  t: "TECHNICIAN",
  technician: "TECHNICIAN",
  n: "NOVICE",
  novice: "NOVICE",
  foundation: "FOUNDATION",
  intermediate: "INTERMEDIATE",
  full: "FULL",
};

function mapLicenseClass(raw: string): LicenseClass {
  return (
    LICENSE_CLASS_MAP[raw.toLowerCase().trim()] ?? ("GENERAL" as LicenseClass)
  );
}

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

  // Multi-source callsign ingestion
  const { result: ingestionResult, loading } = useCallsignIngestion(callsign);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when callsign changes
  useEffect(() => {
    setDismissed(false);
  }, [callsign]);

  // Build current values for conflict detection
  const license = useProfileStore((s) => s.license);
  const bio = useProfileStore((s) => s.bio);
  const station = useProfileStore((s) => s.station);

  const currentValues = useMemo<CurrentValues>(
    () => ({
      name: operatorName || undefined,
      grid: grid || undefined,
      country: license?.country,
      licenseClass: license?.class,
      bio: bio || undefined,
      lat: station?.lat,
      lon: station?.lon,
    }),
    [operatorName, grid, license, bio, station?.lat, station?.lon],
  );

  const handleApply = useCallback(
    (result: IngestionResult, selectedFields: Set<IngestionField>) => {
      if (selectedFields.has("name") && result.name) {
        setOperatorName(result.name);
      }
      if (selectedFields.has("grid") && result.grid) {
        setGrid(result.grid);
      }

      // License fields → profileStore.setLicense
      if (selectedFields.has("licenseClass") || selectedFields.has("country")) {
        const country =
          selectedFields.has("country") && result.country
            ? mapCountry(result.country)
            : (license?.country ?? ("US" as LicenseCountry));
        const cls =
          selectedFields.has("licenseClass") && result.licenseClass
            ? mapLicenseClass(result.licenseClass)
            : (license?.class ?? ("GENERAL" as LicenseClass));

        useProfileStore.getState().setLicense({
          country,
          class: cls,
          expirationDate:
            selectedFields.has("licenseClass") && result.expiryDate
              ? result.expiryDate
              : (license?.expirationDate ?? null),
          grantDate:
            selectedFields.has("licenseClass") && result.grantDate
              ? result.grantDate
              : license?.grantDate,
          licenseId:
            selectedFields.has("licenseId") && result.licenseId
              ? result.licenseId
              : license?.licenseId,
        });
      }

      // Bio → profileStore.setBio
      if (selectedFields.has("bio") && result.bio) {
        useProfileStore.getState().setBio(result.bio);
      }

      // Image → profileStore.setProfileImageUrl
      if (selectedFields.has("imageUrl") && result.imageUrl) {
        useProfileStore.getState().setProfileImageUrl(result.imageUrl);
      }

      // Lat/Lon → update station
      if (
        selectedFields.has("latLon") &&
        result.lat != null &&
        result.lon != null
      ) {
        const currentStation = useProfileStore.getState().station;
        if (currentStation) {
          useProfileStore.getState().setStation({
            ...currentStation,
            lat: result.lat,
            lon: result.lon,
          });
        }
      }

      setDismissed(true);
    },
    [setOperatorName, setGrid, license],
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

        {/* Multi-source callsign ingestion suggestions */}
        {!dismissed && (
          <CallsignLookupSuggestions
            result={ingestionResult}
            loading={loading}
            currentValues={currentValues}
            onApply={handleApply}
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
