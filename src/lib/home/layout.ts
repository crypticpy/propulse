/**
 * Home dashboard layout model.
 *
 * One ordered list of visible item ids per device, persisted at
 * `propulse-home-layout-v2`. Everything here is pure so the reader, the
 * v1 migration, and the reorder/reset helpers can be tested without a DOM.
 *
 * `wide` items own a full-width row; `tile` items are grouped into the
 * existing three-up `home-context-grid` by `groupHomeLayout`.
 */

export type HomeItemKind = "wide" | "tile";

export interface HomeLayoutItem {
  id: string;
  title: string;
  /**
   * One plain sentence under the title, printed in the panel's section header
   * (DS-15) and beside the row in Customize dashboard. It says what the panel
   * shows, not why it is worth having.
   */
  summary: string;
  kind: HomeItemKind;
  /** Rendered only for a signed-in operator (personal or saved-panel data). */
  signedInOnly?: boolean;
}

export const HOME_LAYOUT_ITEMS: readonly HomeLayoutItem[] = [
  { id: "activity", title: "Bands now", summary: "Reception and cluster reports, band by band.", kind: "wide" },
  { id: "forecast", title: "Next 24 hours on your band", summary: "The next 24 hours on the band you are working.", kind: "wide" },
  { id: "station", title: "Your station & recent operating", summary: "Your active setup, recent contacts, and the contest calendar.", kind: "wide", signedInOnly: true },
  { id: "solar", title: "Solar outlook", summary: "Kp, solar flux and X-ray class, with the current briefing.", kind: "tile" },
  { id: "weather", title: "Local weather", summary: "Temperature, wind and the hours ahead at your location.", kind: "tile" },
  { id: "daylight", title: "Daylight", summary: "Solar altitude through the UTC day, with sunrise and sunset.", kind: "tile" },
  { id: "moon", title: "Moon", summary: "Phase, illumination, and rise and set times.", kind: "tile" },
  { id: "planets", title: "Planets", summary: "Which planets are above the horizon from your profile location.", kind: "tile" },
  { id: "clocks", title: "World clocks", summary: "The current time in the zones you follow.", kind: "tile" },
  { id: "countdowns", title: "Countdowns", summary: "Time remaining on the dates you are counting down to.", kind: "tile", signedInOnly: true },
  { id: "tides", title: "Tides", summary: "High and low water for your profile location.", kind: "tile" },
  { id: "environment", title: "UV & air quality", summary: "UV index and air quality at your profile location.", kind: "tile" },
  { id: "metar", title: "Aviation weather", summary: "Airfield weather reports near your profile location.", kind: "tile" },
  { id: "scope", title: "QTH scope", summary: "Lightning strikes and fire hotspots within range of your QTH.", kind: "tile" },
  { id: "volcanoes", title: "Volcano watch", summary: "Volcanoes the USGS currently reports as active.", kind: "tile" },
  { id: "dxpeditions", title: "DXpeditions", summary: "DXpeditions on the air now and coming up.", kind: "tile" },
  { id: "news", title: "Radio news", summary: "Recent headlines from the feeds you follow.", kind: "tile", signedInOnly: true },
  { id: "contests", title: "Contest details", summary: "Contests on the calendar and how conditions look for them.", kind: "tile", signedInOnly: true },
  { id: "history", title: "This day in history", summary: "Amateur radio events that happened on this date.", kind: "tile", signedInOnly: true },
];

/**
 * Catalogue of add-on information panels rendered by `HomeWidgets`. The
 * fixed dashboard sections (activity/forecast/station/solar/weather/daylight)
 * are laid out by Home itself and are not widget ids.
 */
export const HOME_WIDGETS = HOME_LAYOUT_ITEMS.filter(
  (item) => item.kind === "tile" && !["solar", "weather", "daylight"].includes(item.id),
).map((item) => [item.id, item.title] as const);

/** Moon, DXpeditions and World clocks ship visible for a fresh operator. */
export const HOME_LAYOUT_DEFAULT: readonly string[] = [
  "activity",
  "forecast",
  "solar",
  "weather",
  "daylight",
  "station",
  "moon",
  "dxpeditions",
  "clocks",
];

export const HOME_LAYOUT_KEY = "propulse-home-layout-v2";
export const HOME_PINS_KEY = "propulse-home-widgets-v1";

export type HomeDevice = "desktop" | "mobile";
export type HomeLayoutState = Record<HomeDevice, string[]>;

const DEVICES: readonly HomeDevice[] = ["desktop", "mobile"];

export function findHomeItem(id: string): HomeLayoutItem | undefined {
  return HOME_LAYOUT_ITEMS.find((item) => item.id === id);
}

export function homeItemTitle(id: string): string {
  return findHomeItem(id)?.title ?? id;
}

/** The one-line summary printed under a panel's title (DS-15). */
export function homeItemSummary(id: string): string {
  return findHomeItem(id)?.summary ?? "";
}

/** A guest session has no saved profile panels, so those items never render. */
export function isHomeItemAvailable(id: string, guest: boolean): boolean {
  const item = findHomeItem(id);
  if (!item) return false;
  return !(guest && item.signedInOnly);
}

function sanitize(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && findHomeItem(entry)) seen.add(entry);
  }
  return [...seen];
}

/** v1 pins were add-on widgets only; they append after the defaults. */
export function migrateHomePins(pins: string[]): string[] {
  const next = [...HOME_LAYOUT_DEFAULT];
  for (const id of sanitize(pins)) if (!next.includes(id)) next.push(id);
  return next;
}

function parse(value: string | null): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    /* Malformed or unavailable storage falls back to the default layout. */
    return null;
  }
}

/**
 * Reads the persisted layout, migrating a v1 pin list when v2 is absent.
 * Either argument may be null (guest session, cleared storage, private mode).
 */
export function readHomeLayout(rawV2: string | null, rawV1: string | null = null): HomeLayoutState {
  const layout = parse(rawV2);
  const pins = parse(rawV1);
  const state = {} as HomeLayoutState;
  for (const device of DEVICES) {
    const stored = layout ? sanitize(layout[device]) : [];
    state[device] = layout && Array.isArray(layout[device])
      ? stored
      : migrateHomePins(pins ? sanitize(pins[device]) : []);
  }
  return state;
}

export function addHomeItem(list: string[], id: string): string[] {
  if (!findHomeItem(id) || list.includes(id)) return list;
  return [...list, id];
}

export function removeHomeItem(list: string[], id: string): string[] {
  return list.filter((entry) => entry !== id);
}

export function moveHomeItemTo(list: string[], id: string, index: number): string[] {
  const from = list.indexOf(id);
  if (from < 0) return list;
  const target = Math.max(0, Math.min(list.length - 1, index));
  if (target === from) return list;
  const next = [...list];
  next.splice(from, 1);
  next.splice(target, 0, id);
  return next;
}

export function moveHomeItem(list: string[], id: string, delta: number): string[] {
  const from = list.indexOf(id);
  if (from < 0) return list;
  const target = from + delta;
  if (target < 0 || target >= list.length) return list;
  return moveHomeItemTo(list, id, target);
}

export function resetHomeLayout(): string[] {
  return [...HOME_LAYOUT_DEFAULT];
}

export type HomeLayoutGroup =
  | { kind: "wide"; id: string }
  | { kind: "grid"; ids: string[] };

/** Consecutive tiles share one grid; a wide item breaks the run. */
export function groupHomeLayout(list: string[]): HomeLayoutGroup[] {
  const groups: HomeLayoutGroup[] = [];
  for (const id of list) {
    const item = findHomeItem(id);
    if (!item) continue;
    if (item.kind === "wide") {
      groups.push({ kind: "wide", id });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.kind === "grid") last.ids.push(id);
    else groups.push({ kind: "grid", ids: [id] });
  }
  return groups;
}
