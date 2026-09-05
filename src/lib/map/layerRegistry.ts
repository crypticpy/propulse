import {
  getLayerAvailability,
  type PropSphereLayerKey,
  type PropSphereViewMode,
} from "@/lib/map/layerCapabilities";

export type LayerCategoryId =
  | "illumination"
  | "propagation"
  | "hfConditions"
  | "activity"
  | "signals"
  | "weather"
  | "atmosphere";

export interface LayerCategoryMeta {
  id: LayerCategoryId;
  label: string;
}

export interface LayerRegistryEntry {
  key: PropSphereLayerKey;
  /** Short (<=3 char) glyph drawn in the row's icon slot. */
  icon: string;
  name: string;
  category: LayerCategoryId;
  source: string;
  cadence: string;
  coverage: string;
  /** Evergreen caveat independent of the current projection — a data-source
   * limitation or an estimate/model disclosure (not a permission block; see
   * `availability`/`blockedReason` for that). The projection-specific reason
   * (`getLayerAvailability`) is layered on top of this at render time, it
   * does not replace it in the registry itself. */
  caveat?: string;
  /** Whether the underlying source is authorized and operational, per
   * `docs/PROP-SPHERE-LAYER-SOURCE-AUDIT.md`'s "Blocked" class. A blocked
   * layer's toggle must stay disabled regardless of projection support. */
  availability: "live" | "blocked";
  /** Required when `availability` is "blocked" — the reason shown in the
   * caveat slot in place of an evergreen `caveat`. */
  blockedReason?: string;
}

export const LAYER_CATEGORIES: readonly LayerCategoryMeta[] = [
  { id: "illumination", label: "Illumination & Reference" },
  { id: "propagation", label: "Propagation" },
  { id: "hfConditions", label: "HF Conditions" },
  { id: "activity", label: "Spots & Activity" },
  { id: "signals", label: "Signals & Satellites" },
  { id: "weather", label: "Weather & Hazards" },
  { id: "atmosphere", label: "Atmosphere & Log" },
];

/**
 * One entry per `MapState.layers` key (HW-21). Source, cadence and coverage
 * text is drawn from `docs/PROP-SPHERE-LAYER-SOURCE-AUDIT.md` so the wording
 * here, the Layers tab and the PropSphere help page all say the same thing
 * about a layer instead of drifting independently the way the popover, the
 * help page prose and the status line used to. Declaring this as
 * `Record<PropSphereLayerKey, ...>` makes an entry for every layer key
 * mandatory and rejects an unknown key at compile time — the completeness
 * test in `layerRegistry.test.ts` is a runtime backstop, not the only check.
 */
export const LAYER_REGISTRY: Record<PropSphereLayerKey, LayerRegistryEntry> = {
  // ---------- Illumination & Reference ----------
  terminator: {
    key: "terminator",
    availability: "live",
    icon: "DN",
    name: "Day/Night Terminator",
    category: "illumination",
    source: "Local solar-position astronomy",
    cadence: "Real-time",
    coverage: "Global",
  },
  greyline: {
    key: "greyline",
    availability: "live",
    icon: "GL",
    name: "Greyline",
    category: "illumination",
    source: "Local solar geometry",
    cadence: "Real-time",
    coverage: "Global",
  },
  nightLights: {
    key: "nightLights",
    availability: "live",
    icon: "NL",
    name: "Night Lights",
    category: "illumination",
    source: "Bundled night-light imagery",
    cadence: "Static texture",
    coverage: "Global",
    caveat: "Visible on the satellite map style only",
  },
  lunarSubpoint: {
    key: "lunarSubpoint",
    availability: "live",
    icon: "MN",
    name: "Lunar Subpoint",
    category: "illumination",
    source: "Local lunar ephemeris",
    cadence: "Real-time",
    coverage: "Global",
  },
  labels: {
    key: "labels",
    availability: "live",
    icon: "LB",
    name: "Labels",
    category: "illumination",
    source: "Bundled boundaries and place names",
    cadence: "Static",
    coverage: "Global",
  },

  // ---------- Propagation ----------
  muf: {
    key: "muf",
    availability: "live",
    icon: "MU",
    name: "MUF Heatmap",
    category: "propagation",
    source: "Local model from NOAA SFI/Kp",
    cadence: "On solar refresh",
    coverage: "Global",
    caveat: "Estimate only — exclusive with other surface layers",
  },
  aurora: {
    key: "aurora",
    availability: "live",
    icon: "AU",
    name: "Aurora Oval",
    category: "propagation",
    source: "NOAA SWPC OVATION",
    cadence: "30 min",
    coverage: "Polar regions",
  },
  ionosphere: {
    key: "ionosphere",
    availability: "live",
    icon: "IO",
    name: "Ionosphere Shells",
    category: "propagation",
    source: "Illustrative D/E/F1/F2 model",
    cadence: "Display time",
    coverage: "Global",
    caveat: "Visualization, not measured layer heights",
  },
  rayPath: {
    key: "rayPath",
    availability: "live",
    icon: "RP",
    name: "Ray Path",
    category: "propagation",
    source: "Local simplified ray tracing",
    cadence: "On input",
    coverage: "Selected path",
    caveat: "Explainer model, not VOACAP-grade physics",
  },
  nvis: {
    key: "nvis",
    availability: "live",
    icon: "NV",
    name: "NVIS Coverage",
    category: "propagation",
    source: "Local empirical SFI/Kp/time model",
    cadence: "On input",
    coverage: "Your QTH",
  },

  // ---------- HF Conditions ----------
  sporadicE: {
    key: "sporadicE",
    availability: "live",
    icon: "ES",
    name: "Sporadic E",
    category: "hfConditions",
    source: "Seasonal/diurnal empirical model",
    cadence: "Hourly",
    coverage: "Global",
    caveat: "Climatology, not live ionosonde data",
  },
  drap: {
    key: "drap",
    availability: "live",
    icon: "DR",
    name: "D-RAP Absorption",
    category: "hfConditions",
    source: "NOAA SWPC D-RAP",
    cadence: "15 min",
    coverage: "Global",
  },
  ducting: {
    key: "ducting",
    availability: "live",
    icon: "DC",
    name: "Ducting Climatology",
    category: "hfConditions",
    source: "Coastal/seasonal empirical model",
    cadence: "Hourly",
    coverage: "Global",
    caveat: "Climatology, not an NWP forecast",
  },
  noiseFloor: {
    key: "noiseFloor",
    availability: "live",
    icon: "NF",
    name: "HF Noise Floor",
    category: "hfConditions",
    source: "Local ITU-R P.372-style estimate",
    cadence: "Hourly",
    coverage: "Global",
    caveat: "Estimate only — exclusive with other surface layers",
  },
  geomagField: {
    key: "geomagField",
    availability: "live",
    icon: "GF",
    name: "Geomagnetic Field",
    category: "hfConditions",
    source: "Illustrative dipole lines, NOAA Kp",
    cadence: "On Kp refresh",
    coverage: "Global",
    caveat: "Visualization, not an IGRF field computation",
  },

  // ---------- Spots & Activity ----------
  spots: {
    key: "spots",
    availability: "live",
    icon: "SP",
    name: "Live Spots",
    category: "activity",
    source: "PSKReporter, RBN, DX Clusters",
    cadence: "30-60 s",
    coverage: "Global",
  },
  activations: {
    key: "activations",
    availability: "live",
    icon: "AC",
    name: "Activations",
    category: "activity",
    source: "POTA, SOTA, WWFF feeds",
    cadence: "Live",
    coverage: "Global",
  },
  spotTraces: {
    key: "spotTraces",
    availability: "live",
    icon: "ST",
    name: "Spot Traces",
    category: "activity",
    source: "Same feed as Live Spots",
    cadence: "30-60 s",
    coverage: "Global",
  },
  ft8Spotter: {
    key: "ft8Spotter",
    availability: "live",
    icon: "F8",
    name: "FT8 Spotter",
    category: "activity",
    source: "Local WASM decoder / WSJT-X bridge",
    cadence: "7.5-15 s",
    coverage: "Your receiver",
  },
  gridActivity: {
    key: "gridActivity",
    availability: "live",
    icon: "GA",
    name: "Grid Activity",
    category: "activity",
    source: "Live spot history",
    cadence: "30-60 s",
    coverage: "Global",
  },
  wspr: {
    key: "wspr",
    availability: "blocked",
    blockedReason: "Disabled pending WSPR.live usage permission",
    icon: "WS",
    name: "WSPR Paths",
    category: "activity",
    source: "WSPR.live",
    cadence: "2 min",
    coverage: "Global",
  },
  aprs: {
    key: "aprs",
    availability: "live",
    icon: "AP",
    name: "APRS Stations",
    category: "activity",
    source: "aprs.fi API",
    cadence: "1-5 min",
    coverage: "Global",
  },

  // ---------- Signals & Satellites ----------
  satellites: {
    key: "satellites",
    availability: "live",
    icon: "SA",
    name: "Satellites",
    category: "signals",
    source: "CelesTrak / AMSAT TLE data",
    cadence: "6 h TLE refresh",
    coverage: "Global",
  },
  issTracker: {
    key: "issTracker",
    availability: "live",
    icon: "IS",
    name: "ISS Tracker",
    category: "signals",
    source: "CelesTrak TLE data",
    cadence: "5 s position",
    coverage: "Global",
  },
  satelliteFootprints: {
    key: "satelliteFootprints",
    availability: "live",
    icon: "SF",
    name: "Sat Footprints",
    category: "signals",
    source: "Derived from current TLE positions",
    cadence: "5 s",
    coverage: "Global",
  },
  beacons: {
    key: "beacons",
    availability: "live",
    icon: "BC",
    name: "Beacon Network",
    category: "signals",
    source: "Bundled NCDXF/IARU schedule",
    cadence: "1 s UTC state",
    coverage: "Global",
  },
  spectrumRing: {
    key: "spectrumRing",
    availability: "live",
    icon: "BW",
    name: "Band Activity Waterfall",
    category: "signals",
    source: "PSKReporter, RBN, local decodes",
    cadence: "30 s",
    coverage: "Global",
  },
  timeStations: {
    key: "timeStations",
    availability: "live",
    icon: "TS",
    name: "Time Stations",
    category: "signals",
    source: "Bundled WWV/WWVH/CHU schedule",
    cadence: "Static schedule",
    coverage: "Global",
  },
  meteorShowers: {
    key: "meteorShowers",
    availability: "live",
    icon: "MS",
    name: "Meteor Showers",
    category: "signals",
    source: "Bundled shower calendar",
    cadence: "Daily",
    coverage: "Global",
    caveat: "Schedule-based, not live meteor detection",
  },
  repeaters: {
    key: "repeaters",
    availability: "live",
    icon: "RT",
    name: "Repeaters",
    category: "signals",
    source: "RepeaterBook API",
    cadence: "30 min",
    coverage: "Near your station",
  },

  // ---------- Weather & Hazards ----------
  earthquakes: {
    key: "earthquakes",
    availability: "live",
    icon: "EQ",
    name: "Earthquakes",
    category: "weather",
    source: "USGS M2.5+ GeoJSON feed",
    cadence: "10 min",
    coverage: "Global",
  },
  weather: {
    key: "weather",
    availability: "live",
    icon: "WX",
    name: "Weather Alerts",
    category: "weather",
    source: "NWS active alerts API",
    cadence: "10 min",
    coverage: "United States",
  },
  lightning: {
    key: "lightning",
    availability: "blocked",
    blockedReason: "Disabled — no authorized lightning data source",
    icon: "LT",
    name: "Lightning",
    category: "weather",
    source: "Blitzortung / LightningMaps",
    cadence: "1 min",
    coverage: "Global",
  },
  fires: {
    key: "fires",
    availability: "live",
    icon: "FR",
    name: "Active Fires",
    category: "weather",
    source: "NASA FIRMS VIIRS NRT",
    cadence: "30 min",
    coverage: "Global",
  },
  radar: {
    key: "radar",
    availability: "live",
    icon: "RD",
    name: "Weather Radar",
    category: "weather",
    source: "RainViewer public weather maps",
    cadence: "10 min",
    coverage: "Global",
    caveat: "Estimate only — exclusive with other surface layers",
  },
  tropical: {
    key: "tropical",
    availability: "live",
    icon: "TC",
    name: "Tropical Cyclones",
    category: "weather",
    source: "NOAA/NHC current summaries",
    cadence: "15 min",
    coverage: "Global",
  },
  riverGauges: {
    key: "riverGauges",
    availability: "live",
    icon: "RG",
    name: "River Gauges",
    category: "weather",
    source: "USGS Water Services",
    cadence: "15 min",
    coverage: "United States",
  },

  // ---------- Atmosphere & Log ----------
  goesCloud: {
    key: "goesCloud",
    availability: "live",
    icon: "GC",
    name: "GOES-East Cloud",
    category: "atmosphere",
    source: "NASA GIBS GOES-East ABI",
    cadence: "10 min",
    coverage: "Western hemisphere",
    caveat: "Exclusive with other surface layers",
  },
  tec: {
    key: "tec",
    availability: "blocked",
    blockedReason: "Disabled — pipeline retired pending replacement",
    icon: "TE",
    name: "Ionospheric TEC",
    category: "atmosphere",
    source: "NOAA experimental TEC pipeline",
    cadence: "15 min intended",
    coverage: "Global",
  },
  sst: {
    key: "sst",
    availability: "live",
    icon: "SST",
    name: "Sea Surface Temperature",
    category: "atmosphere",
    source: "NOAA OISST v2.1 via ERDDAP",
    cadence: "Daily, 6 h cache",
    coverage: "Global",
    caveat: "Exclusive with other surface layers",
  },
  contestQsos: {
    key: "contestQsos",
    availability: "live",
    icon: "CQ",
    name: "Contest QSOs",
    category: "atmosphere",
    source: "Your contest log",
    cadence: "On change",
    coverage: "Your station",
  },
  loggedQsos: {
    key: "loggedQsos",
    availability: "live",
    icon: "LQ",
    name: "Logged QSOs",
    category: "atmosphere",
    source: "Your station logbook",
    cadence: "On change",
    coverage: "Your station",
  },
};

/** `source · cadence · coverage`, the exact provenance wording every
 * surface (Layers tab row, help page reference) draws from so the words
 * never drift between them. */
export function formatLayerProvenance(entry: LayerRegistryEntry): string {
  return `${entry.source} · ${entry.cadence} · ${entry.coverage}`;
}

/** Entries for one category, in registry declaration order. */
export function layersInCategory(
  category: LayerCategoryId,
): LayerRegistryEntry[] {
  return (Object.values(LAYER_REGISTRY) as LayerRegistryEntry[]).filter(
    (entry) => entry.category === category,
  );
}

/**
 * The effective caveat a row shows: the current projection's reason a layer
 * cannot be shown takes priority (it is the more urgent, state-dependent
 * fact), falling back to the registry's evergreen caveat.
 */
export function effectiveLayerCaveat(
  key: PropSphereLayerKey,
  viewMode: PropSphereViewMode,
): string | undefined {
  const availability = getLayerAvailability(key, viewMode);
  if (!availability.available) return availability.reason;
  const entry = LAYER_REGISTRY[key];
  if (entry.availability === "blocked") return entry.blockedReason;
  return entry.caveat;
}

/**
 * The registry's own caveat text, independent of projection or viewMode —
 * the blocked reason when the source is blocked, otherwise the evergreen
 * caveat. Used by static reference surfaces (the PropSphere help table) that
 * have no current viewMode to weigh against `getLayerAvailability`.
 */
export function registryCaveat(entry: LayerRegistryEntry): string | undefined {
  return entry.availability === "blocked" ? entry.blockedReason : entry.caveat;
}

/**
 * Whether a layer's toggle should be disabled: the current projection cannot
 * render it, or its source is blocked (B6 fix #4) — either reason is
 * surfaced through `effectiveLayerCaveat`, not just this boolean.
 */
export function isLayerToggleDisabled(
  key: PropSphereLayerKey,
  viewMode: PropSphereViewMode,
): boolean {
  return (
    !getLayerAvailability(key, viewMode).available ||
    LAYER_REGISTRY[key].availability === "blocked"
  );
}
