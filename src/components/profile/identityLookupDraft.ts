/**
 * Cancellable identity-lookup draft: Apply writes here, Save commits,
 * Cancel leaves profile / license settings / ingestion metadata untouched.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { applyIdentitySave } from "@/stores/applyIdentitySave";
import { useProfileStore } from "@/stores/profileStore";
import { isValidGrid } from "@/lib/utils/grid";
import type { IngestionResult } from "@/hooks/useCallsignIngestion";
import type {
  LicenseClass,
  LicenseCountry,
  LicenseInfo,
  UserStation,
} from "@/types/user";
import type { IngestionField } from "./CallsignLookupSuggestions";

export interface IdentityImportDraft {
  operatorName?: string;
  grid?: string;
  license?: Partial<LicenseInfo>;
  bio?: string;
  imageUrl?: string;
  lat?: number;
  lon?: number;
  lastIngestedCallsign?: string;
}

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

/** Amateur radio: 1-3 prefix + digit + 0-3 middle + letter suffix (W5XXX, VE3ABC) */
const AMATEUR_CALLSIGN_REGEX = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,3}[A-Z]$/i;
/** GMRS: W + 3 letters + 3 digits (WSLK349, WRFQ375) */
const GMRS_CALLSIGN_REGEX = /^W[A-Z]{3}[0-9]{3}$/i;

function isValidCallsign(cs: string): boolean {
  return AMATEUR_CALLSIGN_REGEX.test(cs) || GMRS_CALLSIGN_REGEX.test(cs);
}

export function mapLookupCountry(name: string): LicenseCountry {
  return COUNTRY_MAP[name.toLowerCase().trim()] ?? "OTHER";
}

export function mapLookupLicenseClass(raw: string): LicenseClass {
  const mapped = LICENSE_CLASS_MAP[raw.toLowerCase().trim()];
  if (!mapped) {
    console.warn(
      `[Propulse] Unknown license class "${raw}", defaulting to GENERAL`,
    );
  }
  return mapped ?? ("GENERAL" as LicenseClass);
}

export function isIdentityImportDirty(draft: IdentityImportDraft): boolean {
  return (
    draft.license !== undefined ||
    draft.bio !== undefined ||
    draft.imageUrl !== undefined ||
    typeof draft.lat === "number" ||
    typeof draft.lon === "number" ||
    Boolean(draft.lastIngestedCallsign)
  );
}

export function identityFieldsFromStation(station: UserStation | null): {
  callsign: string;
  operatorName: string;
  grid: string;
} {
  return {
    callsign: station?.callsign ?? "",
    operatorName: station?.operatorName ?? "",
    grid: station?.grid ?? "",
  };
}

export function identityFieldsDirty(
  fields: { callsign: string; operatorName: string; grid: string },
  station: UserStation | null,
): boolean {
  return (
    fields.callsign !== (station?.callsign ?? "") ||
    fields.operatorName !== (station?.operatorName ?? "") ||
    fields.grid !== (station?.grid ?? "")
  );
}

/**
 * Apply selected lookup fields into one draft. Does not write stores.
 * Unselected fields are omitted so Save will not overwrite them.
 */
export function buildLookupImport(
  result: IngestionResult,
  selectedFields: Set<IngestionField>,
  callsign: string,
): {
  operatorName?: string;
  grid?: string;
  importDraft: IdentityImportDraft;
} {
  const importDraft: IdentityImportDraft = {
    lastIngestedCallsign: callsign.trim().toUpperCase(),
  };
  let operatorName: string | undefined;
  let grid: string | undefined;

  if (selectedFields.has("name") && result.name) {
    operatorName = result.name;
    importDraft.operatorName = result.name;
  }
  if (selectedFields.has("grid") && result.grid) {
    grid = result.grid;
    importDraft.grid = result.grid;
  }

  const license: Partial<LicenseInfo> = {};
  if (selectedFields.has("country") && result.country) {
    license.country = mapLookupCountry(result.country);
  }
  if (selectedFields.has("licenseClass")) {
    if (result.licenseClass) license.class = mapLookupLicenseClass(result.licenseClass);
    if (result.expiryDate) license.expirationDate = result.expiryDate;
    if (result.grantDate) license.grantDate = result.grantDate;
  }
  if (selectedFields.has("licenseId") && result.licenseId) {
    license.licenseId = result.licenseId;
  }
  if (Object.keys(license).length > 0) importDraft.license = license;

  if (selectedFields.has("bio") && result.bio) {
    importDraft.bio = result.bio;
  }
  if (selectedFields.has("imageUrl") && result.imageUrl) {
    importDraft.imageUrl = result.imageUrl;
  }
  if (
    selectedFields.has("latLon") &&
    result.lat != null &&
    result.lon != null
  ) {
    importDraft.lat = result.lat;
    importDraft.lon = result.lon;
  }

  return { operatorName, grid, importDraft };
}

/** Patch lookup coordinates onto the station and Home only. */
export function overlayStationLookupCoords(
  station: UserStation,
  lat: number,
  lon: number,
): UserStation {
  const homeId = station.homeLocationId;
  const savedLocations = homeId
    ? station.savedLocations.map((loc) =>
        loc.id === homeId ? { ...loc, lat, lon } : loc,
      )
    : station.savedLocations;
  const active = savedLocations.find(
    (loc) => loc.id === station.activeLocationId,
  );
  return {
    ...station,
    grid: active?.grid ?? station.grid,
    lat: active?.lat ?? lat,
    lon: active?.lon ?? lon,
    savedLocations,
  };
}

export function commitIdentityImportRecords(
  draft: IdentityImportDraft,
  profile: {
    license?: LicenseInfo;
    setLicense: (license: LicenseInfo) => void;
    setBio: (bio: string) => void;
    setProfileImageUrl: (url: string) => void;
    setLastIngestedCallsign: (callsign: string) => void;
  },
): void {
  if (draft.license) {
    profile.setLicense({
      country: "US",
      class: "GENERAL",
      expirationDate: null,
      ...profile.license,
      ...draft.license,
    });
  }
  if (draft.bio !== undefined) profile.setBio(draft.bio);
  if (draft.imageUrl !== undefined) profile.setProfileImageUrl(draft.imageUrl);
  if (draft.lastIngestedCallsign) {
    profile.setLastIngestedCallsign(draft.lastIngestedCallsign);
  }
}

export function saveIdentityWithLookup(
  station: UserStation | null,
  identity: { callsign: string; operatorName: string; grid: string },
  draft: IdentityImportDraft,
): UserStation | null {
  const coordsPending =
    typeof draft.lat === "number" && typeof draft.lon === "number";
  const identityChanged = identityFieldsDirty(identity, station);
  if (!identityChanged && !coordsPending) {
    return station;
  }
  let next = applyIdentitySave(station, identity);
  if (next && coordsPending) {
    next = overlayStationLookupCoords(next, draft.lat!, draft.lon!);
  }
  return next;
}

export function useStationIdentityDraft() {
  const station = useProfileStore((s) => s.station);
  const setStation = useProfileStore((s) => s.setStation);

  const [callsign, setCallsign] = useState(() => station?.callsign ?? "");
  const [operatorName, setOperatorName] = useState(
    () => station?.operatorName ?? "",
  );
  const [grid, setGrid] = useState(() => station?.grid ?? "");
  const [callsignError, setCallsignError] = useState<string | null>(null);
  const [gridError, setGridError] = useState<string | null>(null);
  const [importDraft, setImportDraft] = useState<IdentityImportDraft>({});
  const [baseline, setBaseline] = useState(() =>
    identityFieldsFromStation(station),
  );

  const userIdentityDirty =
    callsign !== baseline.callsign ||
    operatorName !== baseline.operatorName ||
    importDraft.operatorName !== undefined ||
    grid !== baseline.grid ||
    importDraft.grid !== undefined;
  const isDirty = userIdentityDirty || isIdentityImportDirty(importDraft);

  // Retain a user/import draft. Sync from station only when that draft is clean.
  useEffect(() => {
    if (isDirty) return;
    const next = identityFieldsFromStation(station);
    setCallsign(next.callsign);
    setOperatorName(next.operatorName);
    setGrid(next.grid);
    setCallsignError(null);
    setGridError(null);
    setBaseline(next);
  }, [station, isDirty]);

  const handleSave = useCallback((): boolean => {
    // Merge only edited fields into the latest station; a pending import must
    // not turn untouched identity inputs into writes of stale snapshot values.
    const latest = identityFieldsFromStation(station);
    const resolved = {
      callsign: callsign !== baseline.callsign ? callsign : latest.callsign,
      operatorName:
        operatorName !== baseline.operatorName ||
        importDraft.operatorName !== undefined
          ? operatorName
          : latest.operatorName,
      grid:
        grid !== baseline.grid || importDraft.grid !== undefined
          ? grid
          : latest.grid,
    };
    const trimmedCallsign = resolved.callsign.toUpperCase().trim();
    if (
      importDraft.lastIngestedCallsign &&
      importDraft.lastIngestedCallsign !== trimmedCallsign
    ) {
      setCallsignError(
        "Lookup suggestions belong to a different callsign. Restore that callsign or Cancel and look up the new callsign.",
      );
      return false;
    }
    if (trimmedCallsign && !isValidCallsign(trimmedCallsign)) {
      setCallsignError(
        "Please enter a valid callsign (e.g., W5XXX, VE3XXX, or GMRS like WSLK349)",
      );
      return false;
    }
    setCallsignError(null);

    if (resolved.grid && !isValidGrid(resolved.grid)) {
      setGridError("Please enter a valid Maidenhead grid square");
      return false;
    }
    setGridError(null);

    const nextStation = saveIdentityWithLookup(
      station,
      {
        callsign: trimmedCallsign,
        operatorName: resolved.operatorName,
        grid: resolved.grid,
      },
      importDraft,
    );
    if (nextStation !== station) {
      setStation(nextStation);
    }
    commitIdentityImportRecords(importDraft, useProfileStore.getState());
    resolved.callsign = trimmedCallsign;
    setCallsign(resolved.callsign);
    setOperatorName(resolved.operatorName);
    setGrid(resolved.grid);
    setImportDraft({});
    setBaseline(resolved);
    return true;
  }, [
    callsign,
    operatorName,
    grid,
    station,
    setStation,
    importDraft,
    baseline,
  ]);

  const handleCancelEdit = useCallback(() => {
    const next = identityFieldsFromStation(station);
    setCallsign(next.callsign);
    setOperatorName(next.operatorName);
    setGrid(next.grid);
    setCallsignError(null);
    setGridError(null);
    setImportDraft({});
    setBaseline(next);
  }, [station]);

  const formProps = useMemo(
    () => ({
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
      importDraft,
      onImportDraft: setImportDraft,
    }),
    [
      callsign,
      operatorName,
      grid,
      isDirty,
      handleSave,
      callsignError,
      gridError,
      importDraft,
    ],
  );

  return {
    formProps,
    handleSave,
    handleCancelEdit,
    isDirty,
  };
}
