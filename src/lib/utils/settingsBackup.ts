/**
 * Settings Backup Utilities
 *
 * Provides export/import functionality for user settings.
 * Exports user preferences, pins, alerts, filters, and saved targets as JSON.
 * Validates and applies imported settings with version compatibility checking.
 */

import { useProfileStore, type SavedTarget } from "@/stores/profileStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useShackStore } from "@/stores/shackStore";
import {
  useMapStore,
  type PanelStates,
  type TargetLocation,
} from "@/stores/mapStore";
import { useDXStore } from "@/stores/dxStore";
import { useWatchStore, type WatchItem } from "@/stores/watchStore";
import { usePinStore } from "@/stores/pinStore";
import { useAlertsStore } from "@/stores/alertsStore";
import type { MapPin } from "@/types/pin";
import type { UserStation, UserPreferences } from "@/types/user";
import type {
  UserAntenna,
  UserFeedline,
  UserAccessory,
  StationPreset,
  InlineComponent,
} from "@/types/shack";
import type { StationChain } from "@/types/stationChain";

/** Current backup format version */
const CURRENT_VERSION = 1;

/**
 * Backup data structure containing all exportable settings
 */
export interface SettingsBackup {
  /** Backup format version for compatibility checking */
  version: number;
  /** ISO timestamp when backup was created */
  exportedAt: string;
  /** Application name for verification */
  appName: "propulse";
  /** User station and preferences */
  userPreferences: {
    station: UserStation | null;
    preferences: Omit<UserPreferences, "station">;
    savedTargets: SavedTarget[];
  };
  /** Map display settings */
  mapSettings: {
    panelStates: PanelStates;
    recentTargets: TargetLocation[];
  };
  /** DX cluster filter preferences */
  dxFilters: {
    bands: string[];
    modes: string[];
    maxAge: number;
    neededOnly: boolean;
    sortByNeeded: boolean;
  };
  /** Watch alerts configuration */
  watches: WatchItem[];
  /** Map pins/bookmarks */
  pins: MapPin[];
  /** Dismissed alert IDs */
  dismissedAlertIds: string[];
  /** Shack equipment data */
  shackEquipment?: {
    antennas: UserAntenna[];
    feedlines: UserFeedline[];
    inlineComponents?: InlineComponent[];
    accessories: UserAccessory[];
    stationPresets: StationPreset[];
    activePresetId: string | null;
    stationChains?: StationChain[];
    activeChainId?: string | null;
  };
}

/**
 * Validation result for backup files
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Import result with details about what was applied
 */
export interface ImportResult {
  success: boolean;
  error?: string;
  imported: {
    userPreferences: boolean;
    mapSettings: boolean;
    dxFilters: boolean;
    watches: boolean;
    pins: boolean;
    alerts: boolean;
  };
}

/**
 * Export all user settings to a backup object
 * @returns Complete backup of all exportable settings
 */
export function exportSettings(): SettingsBackup {
  const profile = useProfileStore.getState();
  const settings = useSettingsStore.getState();
  const shack = useShackStore.getState();
  const mapState = useMapStore.getState();
  const dxState = useDXStore.getState();
  const watchState = useWatchStore.getState();
  const pinState = usePinStore.getState();
  const alertsState = useAlertsStore.getState();

  // Reconstruct legacy preferences shape for backup compatibility
  const preferences: Omit<UserPreferences, "station"> = {
    units: settings.units,
    timeFormat: settings.timeFormat,
    theme: settings.theme,
    ituRegion: settings.ituRegion,
    licenseClass: settings.licenseClass,
    textScale: settings.textScale,
    colorBlindMode: settings.colorBlindMode,
    noiseEnvironment: settings.noiseEnvironment,
    antennaType: settings.antennaType,
    bridgeEnabled: settings.bridgeEnabled,
    preferTestedSpecs: settings.preferTestedSpecs,
    favoredBands: settings.favoredBands,
    bandPresets: settings.bandPresets,
    notifications: settings.notifications,
    spotClustering: settings.spotClustering,
    compassRose: settings.compassRose,
    spotAge: settings.spotAge,
    watchAlerts: settings.watchAlerts,
    uiInteraction: settings.uiInteraction,
    forecastDisplay: settings.forecastDisplay,
    radios: shack.radios,
    customRadios: shack.customRadios,
    activeRadioId: shack.activeRadioId,
    license: profile.license,
  };

  return {
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    appName: "propulse",
    userPreferences: {
      station: profile.station,
      preferences,
      savedTargets: profile.savedTargets,
    },
    mapSettings: {
      panelStates: mapState.panelStates,
      recentTargets: mapState.recentTargets,
    },
    dxFilters: {
      bands: dxState.filters.bands ?? [],
      modes: dxState.filters.modes ?? [],
      maxAge: dxState.filters.maxAge ?? 30,
      neededOnly: dxState.filters.neededOnly ?? false,
      sortByNeeded: dxState.filters.sortByNeeded ?? false,
    },
    watches: watchState.watches,
    pins: pinState.pins,
    dismissedAlertIds: alertsState.dismissedAlertIds,
    shackEquipment: {
      antennas: shack.antennas,
      feedlines: shack.feedlines,
      inlineComponents: shack.inlineComponents,
      accessories: shack.accessories,
      stationPresets: shack.stationPresets,
      activePresetId: shack.activePresetId,
      stationChains: shack.stationChains,
      activeChainId: shack.activeChainId,
    },
  };
}

/**
 * Download settings backup as a JSON file
 * Creates a downloadable file with timestamp in the filename
 */
export function downloadSettingsBackup(): void {
  const backup = exportSettings();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().split("T")[0];
  const filename = `propulse-backup-${date}.json`;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Validate a backup object for import compatibility
 * @param data - Parsed JSON data to validate
 * @returns Validation result with any errors or warnings
 */
export function validateBackup(data: unknown): ValidationResult {
  const warnings: string[] = [];

  // Check basic structure
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Invalid file format: expected JSON object" };
  }

  const backup = data as Record<string, unknown>;

  // Check app name
  if (backup.appName !== "propulse") {
    return {
      valid: false,
      error: "Invalid backup file: not a PropulSE settings backup",
    };
  }

  // Check version
  if (typeof backup.version !== "number") {
    return { valid: false, error: "Invalid backup: missing version number" };
  }

  if (backup.version > CURRENT_VERSION) {
    return {
      valid: false,
      error: `Incompatible backup version ${backup.version}. This app supports version ${CURRENT_VERSION} or lower. Please update PropulSE.`,
    };
  }

  if (backup.version < CURRENT_VERSION) {
    warnings.push(
      `Backup is from an older version (${backup.version}). Some settings may be upgraded automatically.`,
    );
  }

  // Check exportedAt timestamp
  if (typeof backup.exportedAt !== "string") {
    return { valid: false, error: "Invalid backup: missing export timestamp" };
  }

  const exportDate = new Date(backup.exportedAt);
  if (isNaN(exportDate.getTime())) {
    return { valid: false, error: "Invalid backup: invalid export timestamp" };
  }

  // Check for expected top-level sections (warnings only, not errors)
  const expectedSections = [
    "userPreferences",
    "mapSettings",
    "dxFilters",
    "watches",
    "pins",
  ];
  for (const section of expectedSections) {
    if (!(section in backup)) {
      warnings.push(
        `Missing section: ${section}. This section will be skipped.`,
      );
    }
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Read and parse a backup file
 * @param file - File object from file input
 * @returns Promise resolving to parsed backup data or error
 */
export async function readBackupFile(
  file: File,
): Promise<
  { data: SettingsBackup; validation: ValidationResult } | { error: string }
> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const validation = validateBackup(data);

    if (!validation.valid) {
      return { error: validation.error || "Invalid backup file" };
    }

    return { data: data as SettingsBackup, validation };
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { error: "Invalid JSON file: could not parse backup" };
    }
    return {
      error: `Failed to read file: ${e instanceof Error ? e.message : "Unknown error"}`,
    };
  }
}

/**
 * Import settings from a validated backup
 * @param backup - Validated backup object to import
 * @returns Import result with details about what was applied
 */
export function importSettings(backup: SettingsBackup): ImportResult {
  const result: ImportResult = {
    success: true,
    imported: {
      userPreferences: false,
      mapSettings: false,
      dxFilters: false,
      watches: false,
      pins: false,
      alerts: false,
    },
  };

  try {
    // Import user preferences
    if (backup.userPreferences) {
      const profileStore = useProfileStore.getState();

      if (backup.userPreferences.station !== undefined) {
        profileStore.setStation(backup.userPreferences.station);
      }

      if (backup.userPreferences.preferences) {
        const prefs = backup.userPreferences.preferences;
        // Route to settings store (flat merge)
        const {
          radios,
          customRadios,
          activeRadioId,
          license,
          station: _station,
          ...settingsFields
        } = prefs as Record<string, unknown>;
        useSettingsStore.getState().updatePreferences(settingsFields as never);

        // Route to shack store
        if (
          radios !== undefined ||
          customRadios !== undefined ||
          activeRadioId !== undefined
        ) {
          useShackStore.setState({
            ...(radios !== undefined ? { radios } : {}),
            ...(customRadios !== undefined ? { customRadios } : {}),
            ...(activeRadioId !== undefined ? { activeRadioId } : {}),
          } as never);
        }

        // Route license to profile store
        if (license !== undefined) {
          useProfileStore.setState({ license } as never);
        }
      }

      // Import shack equipment
      if (backup.shackEquipment) {
        useShackStore.setState({
          antennas: backup.shackEquipment.antennas ?? [],
          feedlines: backup.shackEquipment.feedlines ?? [],
          inlineComponents: backup.shackEquipment.inlineComponents ?? [],
          accessories: backup.shackEquipment.accessories ?? [],
          stationPresets: backup.shackEquipment.stationPresets ?? [],
          activePresetId: backup.shackEquipment.activePresetId ?? null,
          // Station chains — gracefully handle old backups that lack these fields
          ...(backup.shackEquipment.stationChains !== undefined
            ? { stationChains: backup.shackEquipment.stationChains }
            : {}),
          ...(backup.shackEquipment.activeChainId !== undefined
            ? { activeChainId: backup.shackEquipment.activeChainId }
            : {}),
        });
      }

      if (backup.userPreferences.savedTargets) {
        // Clear existing targets and add imported ones
        profileStore.clearTargets();
        for (const target of backup.userPreferences.savedTargets) {
          profileStore.addTarget({
            name: target.name,
            lat: target.lat,
            lon: target.lon,
            grid: target.grid,
          });
        }
      }

      result.imported.userPreferences = true;
    }

    // Import map settings
    if (backup.mapSettings) {
      const mapStore = useMapStore.getState();

      if (backup.mapSettings.panelStates) {
        for (const [panelId, collapsed] of Object.entries(
          backup.mapSettings.panelStates,
        )) {
          mapStore.setPanelCollapsed(
            panelId as keyof PanelStates,
            collapsed as boolean,
          );
        }
      }

      // Recent targets are managed internally by setTarget, so we import them directly
      if (backup.mapSettings.recentTargets) {
        // Clear and re-add recent targets by setting each one
        mapStore.clearRecentTargets();
        // Add in reverse order so the first one ends up at the front
        const reversedTargets = [...backup.mapSettings.recentTargets].reverse();
        for (const target of reversedTargets) {
          mapStore.setTarget(target);
        }
        // Clear the current target after importing history
        mapStore.setTarget(null);
      }

      result.imported.mapSettings = true;
    }

    // Import DX filters
    if (backup.dxFilters) {
      const dxStore = useDXStore.getState();

      dxStore.setFilters({
        ...dxStore.filters,
        bands: backup.dxFilters.bands ?? [],
        modes: backup.dxFilters.modes ?? [],
        maxAge: backup.dxFilters.maxAge ?? 30,
        neededOnly: backup.dxFilters.neededOnly ?? false,
        sortByNeeded: backup.dxFilters.sortByNeeded ?? false,
      });

      result.imported.dxFilters = true;
    }

    // Import watches
    if (backup.watches && Array.isArray(backup.watches)) {
      const watchStore = useWatchStore.getState();

      // Remove existing watches
      for (const watch of watchStore.watches) {
        watchStore.removeWatch(watch.id);
      }

      // Add imported watches
      for (const watch of backup.watches) {
        watchStore.addWatch(watch.type, watch.pattern, watch.name);
      }

      result.imported.watches = true;
    }

    // Import pins
    if (backup.pins && Array.isArray(backup.pins)) {
      const pinStore = usePinStore.getState();

      // Clear existing pins
      pinStore.clearPins();

      // Add imported pins
      for (const pin of backup.pins) {
        pinStore.addPin({
          lat: pin.lat,
          lon: pin.lon,
          grid: pin.grid,
          name: pin.name,
          color: pin.color,
          category: pin.category,
          notes: pin.notes,
          expiresAt: pin.expiresAt,
        });
      }

      result.imported.pins = true;
    }

    // Import dismissed alert IDs
    if (backup.dismissedAlertIds && Array.isArray(backup.dismissedAlertIds)) {
      const alertsStore = useAlertsStore.getState();
      // Merge imported dismissed IDs with any existing ones
      const existingIds = new Set(alertsStore.dismissedAlertIds);
      for (const id of backup.dismissedAlertIds) {
        existingIds.add(id);
      }
      useAlertsStore.setState({
        dismissedAlertIds: Array.from(existingIds),
      });
      result.imported.alerts = true;
    }

    return result;
  } catch (e) {
    return {
      success: false,
      error: `Failed to apply settings: ${e instanceof Error ? e.message : "Unknown error"}`,
      imported: result.imported,
    };
  }
}

/**
 * Get a formatted summary of what's in a backup
 * @param backup - Backup to summarize
 * @returns Human-readable summary of backup contents
 */
export function getBackupSummary(backup: SettingsBackup): string {
  const parts: string[] = [];

  const exportDate = new Date(backup.exportedAt).toLocaleDateString();
  parts.push(`Backup from ${exportDate}`);

  if (backup.userPreferences?.station?.callsign) {
    parts.push(`Station: ${backup.userPreferences.station.callsign}`);
  }

  const counts: string[] = [];
  if (backup.userPreferences?.savedTargets?.length) {
    counts.push(`${backup.userPreferences.savedTargets.length} saved targets`);
  }
  if (backup.watches?.length) {
    counts.push(`${backup.watches.length} watches`);
  }
  if (backup.pins?.length) {
    counts.push(`${backup.pins.length} pins`);
  }
  if (backup.mapSettings?.recentTargets?.length) {
    counts.push(`${backup.mapSettings.recentTargets.length} recent targets`);
  }
  if (backup.shackEquipment?.antennas?.length) {
    counts.push(`${backup.shackEquipment.antennas.length} antennas`);
  }
  if (backup.shackEquipment?.feedlines?.length) {
    counts.push(`${backup.shackEquipment.feedlines.length} feedlines`);
  }
  if (backup.shackEquipment?.inlineComponents?.length) {
    counts.push(
      `${backup.shackEquipment.inlineComponents.length} inline components`,
    );
  }
  if (backup.shackEquipment?.accessories?.length) {
    counts.push(`${backup.shackEquipment.accessories.length} accessories`);
  }
  if (backup.shackEquipment?.stationPresets?.length) {
    counts.push(
      `${backup.shackEquipment.stationPresets.length} station presets`,
    );
  }
  if (backup.shackEquipment?.stationChains?.length) {
    counts.push(`${backup.shackEquipment.stationChains.length} station chains`);
  }

  if (counts.length > 0) {
    parts.push(`Contains: ${counts.join(", ")}`);
  }

  return parts.join(" | ");
}
