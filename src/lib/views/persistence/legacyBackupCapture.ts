/** SettingsBackup → LegacyViewCapture. Explicit unknown input; no live stores or default storage. */
import {
  captureLegacyViews,
  type LegacyStorageReader,
  type LegacyViewCapture,
} from "./legacyCapture";

/** Copied from the accepted settings backup contract; this module must not import that storeful file. */
export const SETTINGS_BACKUP_APP_NAME = "propulse";
export const SETTINGS_BACKUP_VERSION = 1;

export type LegacyBackupCaptureResult =
  | { status: "ok"; capture: LegacyViewCapture; warnings: string[] }
  | { status: "invalid"; message: string };

const VISUAL_PREFERENCE_KEYS = new Set([
  "textScale", "timeFormat", "theme", "spotClustering", "compassRose", "spotAge",
  "uiInteraction", "forecastDisplay", "tickerPosition", "tickerCoverageArea",
]);
const OMIT_FROM_VIEWS = new Set([
  "station", "savedTargets", "recentTargets", "radios", "customRadios", "activeRadioId",
  "license", "watches", "pins", "dismissedAlertIds", "shackEquipment",
]);
const EXPECTED_SECTIONS = ["userPreferences", "mapSettings", "dxFilters", "watches", "pins"] as const;
const TRANSIENT = new Set([
  "target", "selectedSpot", "selectedReportId", "selectedPathPointId", "expandedGroupIds",
  "instanceId", "popup", "hover", "animationQueue", "animationClock", "measuredQuality",
  "enterSnapshot", "filtersBeforeBands", "observatoryPreviousState", "activeSceneId",
  "pageIndex", "deviceId", "displayId", "syncActive",
]);
const LIMIT = 2 * 1024 * 1024;

function invalid(message: string): LegacyBackupCaptureResult {
  return { status: "invalid", message };
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function dataProp(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
function secretKey(key: string): boolean {
  return /(?:token|password|secret|apikey|credential|authorization)/i.test(key.replace(/[^a-z0-9]/gi, ""));
}

/** Same omission policy as captureLegacyViews, using descriptors so getters never run. */
function sanitize(value: unknown, warnings: Set<string>, depth = 0): unknown {
  if (depth > 20) throw new Error("Legacy capture nesting exceeds limit");
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
    return keys.map((key) => {
      const descriptor = descriptors[key as string];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        warnings.add("Credentials and transient state were omitted from the migration backup");
        return null;
      }
      const sanitized = sanitize(descriptor.value, warnings, depth + 1);
      return sanitized === undefined ? null : sanitized;
    });
  }
  if (value && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      warnings.add("Credentials and transient state were omitted from the migration backup");
      return {};
    }
    const result: Record<string, unknown> = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string" || secretKey(key) || TRANSIENT.has(key) || ["__proto__", "prototype", "constructor"].includes(key)) {
        warnings.add("Credentials and transient state were omitted from the migration backup");
        continue;
      }
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) {
        warnings.add("Credentials and transient state were omitted from the migration backup");
        continue;
      }
      const sanitized = sanitize(descriptor.value, warnings, depth + 1);
      if (sanitized === undefined) continue;
      result[key] = sanitized;
    }
    return result;
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    warnings.add("Credentials and transient state were omitted from the migration backup");
    return undefined;
  }
  return value;
}

function memoryReader(entries: Record<string, string>): LegacyStorageReader {
  return { getItem: (key) => Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null };
}

function partitionRecord(
  value: unknown,
  visualKeys: Set<string> | null,
  warnings: Set<string>,
): { mapped: Record<string, unknown>; recovery: Record<string, unknown> } {
  const mapped: Record<string, unknown> = {};
  const recovery: Record<string, unknown> = {};
  if (!isPlainObject(value)) return { mapped, recovery };
  const sanitized = sanitize(value, warnings);
  if (!isPlainObject(sanitized)) return { mapped, recovery };
  for (const [key, entry] of Object.entries(sanitized)) {
    if (OMIT_FROM_VIEWS.has(key)) {
      warnings.add("Station, equipment, live targets and runtime observations were omitted from view drafts");
      continue;
    }
    if (visualKeys ? visualKeys.has(key) : true) mapped[key] = entry;
    else recovery[key] = entry;
  }
  return { mapped, recovery };
}

/**
 * Validate a legacy SettingsBackup object and map supported visual fields through
 * captureLegacyViews. Unknown non-secret data is retained on the capture for recovery.
 * Does not convert, journal, write, activate or publish.
 */
export function captureLegacyViewsFromSettingsBackup(input: unknown): LegacyBackupCaptureResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalid("Invalid file format: expected JSON object");
  }
  const rootPrototype = Object.getPrototypeOf(input);
  if (rootPrototype !== Object.prototype && rootPrototype !== null) {
    return invalid("Invalid file format: expected JSON object");
  }
  const backup = input as Record<string, unknown>;
  const appName = dataProp(backup, "appName");
  const version = dataProp(backup, "version");
  const exportedAt = dataProp(backup, "exportedAt");
  if (appName !== SETTINGS_BACKUP_APP_NAME) {
    return invalid("Invalid backup file: not a PropulSE settings backup");
  }
  if (typeof version !== "number") return invalid("Invalid backup: missing version number");
  if (version > SETTINGS_BACKUP_VERSION) {
    return invalid(
      `Incompatible backup version ${version}. This app supports version ${SETTINGS_BACKUP_VERSION} or lower. Please update PropulSE.`,
    );
  }
  if (typeof exportedAt !== "string") return invalid("Invalid backup: missing export timestamp");
  if (Number.isNaN(new Date(exportedAt).getTime())) return invalid("Invalid backup: invalid export timestamp");

  const warnings = new Set<string>();
  if (version < SETTINGS_BACKUP_VERSION) {
    warnings.add(`Backup is from an older version (${version}). Some settings may be upgraded automatically.`);
  }
  for (const section of EXPECTED_SECTIONS) {
    if (dataProp(backup, section) === undefined && !Object.prototype.hasOwnProperty.call(backup, section)) {
      warnings.add(`Missing section: ${section}. This section will be skipped.`);
    }
  }

  try {
    const sanitizedBackup = sanitize(backup, warnings);
    if (!isPlainObject(sanitizedBackup)) return invalid("Invalid file format: expected JSON object");

    const user = isPlainObject(sanitizedBackup.userPreferences) ? sanitizedBackup.userPreferences : {};
    if ("station" in user || "savedTargets" in user) {
      warnings.add("Station, equipment, live targets and runtime observations were omitted from view drafts");
    }
    const preferences = partitionRecord(user.preferences, VISUAL_PREFERENCE_KEYS, warnings);
    const unknownUser = partitionRecord(
      Object.fromEntries(Object.entries(user).filter(([key]) => key !== "preferences")),
      new Set(),
      warnings,
    );
    const mapSettings = isPlainObject(sanitizedBackup.mapSettings) ? sanitizedBackup.mapSettings : {};
    if ("recentTargets" in mapSettings) {
      warnings.add("Station, equipment, live targets and runtime observations were omitted from view drafts");
    }
    const panelStates = mapSettings.panelStates;
    const unknownMap = partitionRecord(
      Object.fromEntries(Object.entries(mapSettings).filter(([key]) => key !== "panelStates" && key !== "recentTargets")),
      null,
      warnings,
    );
    const dxMapped = sanitizedBackup.dxFilters === undefined ? undefined : sanitizedBackup.dxFilters;

    const entries: Record<string, string> = {};
    const settingsState = { ...preferences.mapped, ...preferences.recovery };
    if (Object.keys(settingsState).length > 0) entries["propulse-settings"] = JSON.stringify(settingsState);
    if (panelStates !== undefined) entries["propulse-panel-states"] = JSON.stringify(panelStates);
    if (dxMapped !== undefined) entries["propulse-dx-filters"] = JSON.stringify({ filters: dxMapped });

    let capture: LegacyViewCapture;
    try {
      capture = captureLegacyViews(memoryReader(entries), memoryReader({}));
    } catch (error) {
      return invalid(error instanceof Error ? error.message : "Legacy capture failed");
    }

    const recovery: Record<string, unknown> = {
      ...unknownUser.recovery,
      ...unknownMap.mapped,
      ...unknownMap.recovery,
    };
    for (const [key, value] of Object.entries(sanitizedBackup)) {
      if (["appName", "version", "exportedAt", "userPreferences", "mapSettings", "dxFilters"].includes(key)) continue;
      if (OMIT_FROM_VIEWS.has(key)) {
        warnings.add("Station, equipment, live targets and runtime observations were omitted from view drafts");
        continue;
      }
      recovery[key] = value;
    }
    for (const [key, value] of Object.entries(recovery)) {
      if (Object.prototype.hasOwnProperty.call(capture.local, key)) continue;
      capture.local[key] = value;
    }

    const merged = { local: capture.local, session: capture.session, warnings: [...new Set([...capture.warnings, ...warnings])] };
    if (new TextEncoder().encode(JSON.stringify(merged)).length > LIMIT) {
      return invalid("Legacy capture exceeds 2 MiB; nothing was imported from this backup");
    }
    return { status: "ok", capture: merged, warnings: merged.warnings };
  } catch {
    return invalid("Backup could not be sanitized");
  }
}
