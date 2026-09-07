/** Read-only, bounded legacy capture. Never import a live Zustand store here. */
export interface LegacyStorageReader { getItem(key: string): string | null }
export interface LegacyViewCapture {
  local: Record<string, unknown>;
  session: Record<string, unknown>;
  warnings: string[];
}

const JSON_KEYS = [
  "propulse-settings", "propulse-theme", "propulse-map-layers", "propulse-label-options",
  "propulse-panel-states", "propulse-pro-panel-layout", "propulse-dock-groups",
  "propulse-spot-filters", "propulse-dx-filters", "propulse-dx-cluster",
  "propulse-hamclock-layout", "propulse-hamclock-widget-config", "propulse-kiosk",
  "propulse-custom-profiles", "propulse-active-profile", "propulse-region-presets",
] as const;
const VALUE_KEYS = [
  "propulse-map-style", "propulse-tile-provider-id", "propulse-display-quality",
  "propulse-night-darkness", "propulse-grid-label-detail", "propulse-grid-activity-endpoint",
  "propulse-auto-rotate-speed", "propulse-globe-orientation", "propulse-display-fit",
  "propulse-beacon-inactive-opacity", "propulse-nvis-opacity", "propulse-pro-ribbon-expanded",
  "propulse-layout-mode",
] as const;
export const LEGACY_VIEW_LOCAL_KEYS: readonly string[] = [...JSON_KEYS, ...VALUE_KEYS];
export const LEGACY_VIEW_SESSION_KEYS = ["propulse-hamclock-display"] as const;
const LIMIT = 2 * 1024 * 1024;
const TRANSIENT = new Set([
  "target", "selectedSpot", "selectedReportId", "selectedPathPointId", "expandedGroupIds",
  "instanceId", "popup", "hover", "animationQueue", "animationClock", "measuredQuality",
  "enterSnapshot", "filtersBeforeBands", "observatoryPreviousState", "activeSceneId",
  "pageIndex", "deviceId", "displayId", "syncActive",
]);
const secretKey = (key: string) => /(?:token|password|secret|apikey|credential|authorization)/i.test(key.replace(/[^a-z0-9]/gi, ""));

/** Only called on JSON.parse output, so getters/proxies cannot execute during traversal. */
function sanitize(value: unknown, warnings: Set<string>, depth = 0): unknown {
  if (depth > 20) throw new Error("Legacy capture nesting exceeds limit");
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, warnings, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (secretKey(key) || TRANSIENT.has(key) || ["__proto__", "prototype", "constructor"].includes(key)) {
        warnings.add("Credentials and transient state were omitted from the migration backup");
        continue;
      }
      result[key] = sanitize(entry, warnings, depth + 1);
    }
    return result;
  }
  return value;
}

/** Throws on unavailable/read-failing storage: never seal a partial capture as a migration. */
export function captureLegacyViews(local: LegacyStorageReader, session: LegacyStorageReader): LegacyViewCapture {
  const warnings = new Set<string>();
  let bytes = 0;
  const read = (storage: LegacyStorageReader, keys: readonly string[], literals: boolean): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      bytes += new TextEncoder().encode(raw).length;
      if (bytes > LIMIT) throw new Error("Legacy capture exceeds 2 MiB; original storage was retained");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch {
        if (literals && raw.length <= 128) parsed = raw;
        else {
          // Retain corrupt bytes only in untouched legacy storage: they may hide credentials.
          warnings.add(`Invalid JSON in ${key}; original key retained and defaults will be used`);
          continue;
        }
      }
      result[key] = sanitize(parsed, warnings);
    }
    return result;
  };
  const localValues = { ...read(local, JSON_KEYS, false), ...read(local, VALUE_KEYS, true) };
  const sessionValues = read(session, LEGACY_VIEW_SESSION_KEYS, false);
  // Kiosk enabled/rotation settings are intent; running playback is not.
  const kiosk = legacyState(localValues["propulse-kiosk"]);
  if ("active" in kiosk) {
    delete kiosk.active;
    warnings.add("Active kiosk playback was omitted from the migration backup");
  }
  return { local: localValues, session: sessionValues, warnings: [...warnings] };
}

export function legacyObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function legacyState(value: unknown): Record<string, unknown> {
  const object = legacyObject(value);
  return "state" in object ? legacyObject(object.state) : object;
}
