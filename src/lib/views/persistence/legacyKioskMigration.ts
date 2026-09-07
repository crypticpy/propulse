import { legacyObject, legacyState } from "./legacyCapture";

// Freeze the v6 index ordering: later page catalogue changes must not reinterpret
// historical pins. These are the IDs used by kioskStore's v6 → v7 migration.
const LEGACY_PAGE_IDS = ["spots", "solar", "forecast", "weather", "sdr"] as const;

function pageId(index: number): string {
  const normalized = Number.isInteger(index) && index >= 0
    ? index % LEGACY_PAGE_IDS.length
    : 0;
  return LEGACY_PAGE_IDS[normalized];
}

/**
 * Replay only the historical kiosk pin migrations on an independent copy of a
 * captured persistence envelope (or unversioned state). The capture and its
 * unknown fields remain available unchanged for backup. Version validation and
 * final scene validation belong to the outer legacy view converter.
 *
 * Pre-v6 replaces the pin of existing shipped wall/weather scenes, preserving
 * all their other edits and never resurrecting deleted scenes. Pre-v7 then
 * converts numeric indexes to stable IDs. Current v7 pins are left untouched.
 */
export function migrateLegacyKioskPins(capturedBlob: unknown): Record<string, unknown> {
  const envelope = legacyObject(capturedBlob);
  const version = typeof envelope.version === "number" ? envelope.version : 0;
  const state = structuredClone(legacyState(capturedBlob));
  if (!Array.isArray(state.scenes) || version >= 7) return state;

  for (const rawScene of state.scenes) {
    const scene = legacyObject(rawScene);
    if (!scene.map || typeof scene.map !== "object" || Array.isArray(scene.map)) continue;
    const map = legacyObject(scene.map);
    if (version < 6 && (scene.id === "default-wall" || scene.id === "default-hamclock-weather")) {
      const id = scene.id === "default-wall" ? "spots" : "weather";
      map.hamclock = { leftPage: id, rightPage: id };
    }
    const pin = legacyObject(map.hamclock);
    if (typeof pin.leftPage === "number") pin.leftPage = pageId(pin.leftPage);
    if (typeof pin.rightPage === "number") pin.rightPage = pageId(pin.rightPage);
  }
  return state;
}
