import type {
  HamClockAutoPage,
  HamClockTheme,
  RailLayout,
} from "@/stores/hamclockDisplayStore";
import { HAMCLOCK_WALL_PAGES } from "./pages";
import type { TileId } from "./tiles";

/**
 * A shipped preset (wall spec §7): a full rail composition plus a suggested
 * theme. Distinct from `HamClockPreset` in `hamclockDisplayStore.ts`, which
 * is the shape for a *user's own saved* layout and has no `theme` field — a
 * shipped preset's theme is offered as a separate confirm, never forced, so
 * the picker UI (`PagesTilesTab`) keeps it out of the layout/autoPage write
 * that `applyLayoutPreset` performs.
 *
 * This file lives in the wall component tree (unlike the store) so it is
 * free to import `wall/pages.ts` and `wall/tiles` directly; every `pageId`
 * below is one of `HAMCLOCK_WALL_PAGES`'s five ids so a chosen preset
 * survives `hamclockDisplayStore`'s read-time `sanitizeRailLayout` cleanup
 * (which only recognizes those five ids) across a reload.
 */
export interface WallPreset {
  id: string;
  name: string;
  layout: RailLayout;
  autoPage: HamClockAutoPage;
  theme: HamClockTheme;
}

const PAGE_ID = Object.fromEntries(
  HAMCLOCK_WALL_PAGES.map((p) => [p.id, p.id] as const),
) as Record<"spots" | "solar" | "forecast" | "weather" | "sdr", string>;

function layoutOf(
  pages: Array<{ pageId: string; left: TileId[]; right: TileId[] }>,
): RailLayout {
  return {
    left: pages.map((p) => ({ pageId: p.pageId, tileIds: [...p.left] })),
    right: pages.map((p) => ({ pageId: p.pageId, tileIds: [...p.right] })),
  };
}

/**
 * Radio (default): the shipped five-page composition, unmodified — a full
 * operating wall for an active station.
 */
const RADIO_PRESET: WallPreset = {
  id: "preset-radio",
  name: "Radio",
  layout: layoutOf(
    HAMCLOCK_WALL_PAGES.map((p) => ({
      pageId: p.id,
      left: p.left,
      right: p.right,
    })),
  ),
  autoPage: { enabled: true, dwellSeconds: 30 },
  theme: "pulse",
};

/**
 * Weather wall (wall spec §7, HW-53): two pages of purely ambient,
 * no-station tiles for a wall that just shows local conditions. There is no
 * dedicated "news" tile in `WALL_TILES` today, so "News & alerts" is realized
 * with the weather-alerts tile (`alerts`) arranged on both pages alongside
 * the terminator (`sun`/`moon`) and emergency (`emcomm`) tiles.
 */
const WEATHER_WALL_PRESET: WallPreset = {
  id: "preset-weather-wall",
  name: "Weather wall",
  layout: layoutOf([
    {
      pageId: PAGE_ID.weather,
      left: ["weather", "alerts"],
      right: ["emcomm", "moon"],
    },
    {
      pageId: PAGE_ID.forecast,
      left: ["sun", "alerts"],
      right: ["moon", "weather"],
    },
  ]),
  autoPage: { enabled: true, dwellSeconds: 45 },
  theme: "classic",
};

/**
 * News & Earth (wall spec §7): alerts/weather paired with the earth-facing
 * space-weather picture (aurora-relevant `spaceWx`/`solarWind`, the
 * terminator, and the moon) — no station tiles.
 */
const NEWS_AND_EARTH_PRESET: WallPreset = {
  id: "preset-news-earth",
  name: "News & Earth",
  layout: layoutOf([
    {
      pageId: PAGE_ID.weather,
      left: ["alerts", "weather"],
      right: ["emcomm", "sun"],
    },
    {
      pageId: PAGE_ID.solar,
      left: ["spaceWx", "solarWind"],
      right: ["moon", "xray"],
    },
  ]),
  autoPage: { enabled: true, dwellSeconds: 45 },
  theme: "brass",
};

/**
 * Space weather (wall spec §7): the shipped Solar & Space Wx page paired
 * with Forecast, for a station that wants propagation and space-weather
 * context without the spot list.
 */
const SPACE_WEATHER_PRESET: WallPreset = {
  id: "preset-space-weather",
  name: "Space weather",
  layout: layoutOf(
    HAMCLOCK_WALL_PAGES.filter(
      (p) => p.id === PAGE_ID.solar || p.id === PAGE_ID.forecast,
    ).map((p) => ({ pageId: p.id, left: p.left, right: p.right })),
  ),
  autoPage: { enabled: true, dwellSeconds: 30 },
  theme: "pulse",
};

/**
 * Living room (wall spec §7, HW-53): one page, no callsign or station
 * required. Every tile here is checked against the exact HW-53 list —
 * Best band now, DX cluster, Grey line, Recent contacts, MUF at QTH — and
 * excluded; this preset never places one.
 */
const LIVING_ROOM_PRESET: WallPreset = {
  id: "preset-living-room",
  name: "Living room",
  layout: layoutOf([
    {
      pageId: PAGE_ID.weather,
      left: ["sun", "moon"],
      right: ["weather", "alerts"],
    },
  ]),
  autoPage: { enabled: false, dwellSeconds: 30 },
  theme: "classic",
};

/** The five shipped presets (wall spec §7), in the order the picker shows
 * them. `WALL_PRESETS_LIVING_ROOM_ID` names the one preset that must never
 * place a station-dependent tile (HW-53), for tests. */
export const WALL_PRESETS: readonly WallPreset[] = [
  RADIO_PRESET,
  WEATHER_WALL_PRESET,
  NEWS_AND_EARTH_PRESET,
  SPACE_WEATHER_PRESET,
  LIVING_ROOM_PRESET,
];

export const LIVING_ROOM_PRESET_ID = LIVING_ROOM_PRESET.id;

/** The five tiles wall spec §7/HW-53 name as requiring a callsign or station
 * location. A preset (in particular Living room) must never place one. */
export const STATION_DEPENDENT_TILE_IDS: readonly TileId[] = [
  "bestBand",
  "cluster",
  "greyLine",
  "recentContacts",
  "muf",
];
