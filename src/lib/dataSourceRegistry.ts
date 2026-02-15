/**
 * Centralized catalog of all external data dependencies.
 *
 * Every NOAA/NASA/SWPC endpoint the app consumes is declared here with its
 * TanStack Query key (if applicable), expected freshness window, and the
 * UI features it feeds.  This registry is the single source of truth for
 * the error classifier, the data-source status store, and any health
 * monitoring UI.
 *
 * Zero runtime dependencies — pure types + data + two small lookup helpers.
 */

// =============================================================================
// Types
// =============================================================================

/** Union of every registered data-source identifier. */
export type DataSourceId =
  | "noaa-k-index"
  | "noaa-solar-flux"
  | "noaa-magnetometer"
  | "noaa-probabilities"
  | "noaa-sunspots"
  | "noaa-xray"
  | "noaa-protons"
  | "noaa-dst"
  | "noaa-drap"
  | "noaa-flux-forecast"
  | "nasa-cme"
  | "swpc-scales"
  | "swpc-alerts"
  | "swpc-xray-latest"
  | "swpc-solar-wind-mag"
  | "swpc-solar-wind-plasma";

/** Metadata for a single external data source. */
export interface DataSourceEntry {
  /** Unique identifier matching `DataSourceId`. */
  id: DataSourceId;

  /** Human-readable label shown in status UI. */
  label: string;

  /** Organisation / satellite that produces the data. */
  provider: string;

  /** One-line description of what this data represents. */
  description: string;

  /**
   * TanStack React Query keys used to fetch this source.
   * Each inner array is one query key (most sources have exactly one).
   * Direct-fetch sources (SWPC useEffect fetches) have an empty outer array.
   */
  queryKeys: readonly (readonly string[])[];

  /**
   * The endpoint path or full URL used to fetch this data.
   * Proxied sources use the `/api/solar/<slug>` path.
   * Direct-fetch sources use the full `services.swpc.noaa.gov` URL.
   */
  endpoint: string;

  /**
   * Duration (ms) after which the data is considered stale but still usable.
   * Roughly matches the `staleTime` / `refetchInterval` from the React Query
   * hooks or the `setInterval` period for direct fetches.
   */
  expectedFreshnessMs: number;

  /**
   * Duration (ms) after which missing data should be flagged as a problem.
   * Typically 2-6x the expected freshness window.
   */
  criticalStalenessMs: number;

  /** UI features / panels that depend on this data source. */
  affectedFeatures: string[];

  /**
   * `true` when the source is fetched directly from SWPC via useEffect
   * (bypassing React Query).  `false` when fetched through the Vercel
   * Edge Function proxy via TanStack Query.
   */
  directFetch: boolean;

  /** Optional link to the provider's own status / product page. */
  statusUrl?: string;
}

// =============================================================================
// Time helpers (keep file dependency-free)
// =============================================================================

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// =============================================================================
// Registry
// =============================================================================

export const DATA_SOURCE_REGISTRY: Record<DataSourceId, DataSourceEntry> = {
  // ---------------------------------------------------------------------------
  // Proxied sources (fetched via /api/solar/* → TanStack Query)
  // ---------------------------------------------------------------------------

  "noaa-k-index": {
    id: "noaa-k-index",
    label: "K-Index",
    provider: "NOAA SWPC",
    description:
      "Planetary K-index measuring geomagnetic activity on a 0-9 scale.",
    queryKeys: [["solar", "k-index"]],
    endpoint: "/api/solar/k-index",
    expectedFreshnessMs: 5 * MINUTE,
    criticalStalenessMs: 30 * MINUTE,
    affectedFeatures: [
      "PrimaryMetrics",
      "KIndexChart",
      "BandConditions",
      "PropagationIndex",
      "Alerts",
    ],
    directFetch: false,
    statusUrl: "https://www.swpc.noaa.gov/products/planetary-k-index",
  },

  "noaa-solar-flux": {
    id: "noaa-solar-flux",
    label: "Solar Flux (SFI)",
    provider: "NOAA SWPC",
    description: "10.7 cm solar radio flux index in solar flux units (sfu).",
    queryKeys: [["solar", "flux"]],
    endpoint: "/api/solar/flux",
    expectedFreshnessMs: 4 * HOUR,
    criticalStalenessMs: 24 * HOUR,
    affectedFeatures: [
      "PrimaryMetrics",
      "SolarFluxChart",
      "BandConditions",
      "PropagationIndex",
    ],
    directFetch: false,
    statusUrl: "https://www.swpc.noaa.gov/products/10cm-radio-flux",
  },

  "noaa-magnetometer": {
    id: "noaa-magnetometer",
    label: "Magnetometer (Bz/Bt)",
    provider: "NOAA SWPC (DSCOVR satellite)",
    description:
      "Interplanetary magnetic field Bz, By, and Bt from the DSCOVR satellite at L1.",
    queryKeys: [["solar", "magnetometer"]],
    endpoint: "/api/solar/magnetometer",
    expectedFreshnessMs: 5 * MINUTE,
    criticalStalenessMs: 30 * MINUTE,
    affectedFeatures: ["PrimaryMetrics", "BzChart", "BandConditions", "Alerts"],
    directFetch: false,
    statusUrl: "https://www.swpc.noaa.gov/products/real-time-solar-wind",
  },

  "noaa-probabilities": {
    id: "noaa-probabilities",
    label: "Flare Probabilities",
    provider: "NOAA SWPC",
    description:
      "1-day forecast probabilities for C, M, X-class flares and proton events.",
    queryKeys: [["solar", "probabilities"]],
    endpoint: "/api/solar/probabilities",
    expectedFreshnessMs: 6 * HOUR,
    criticalStalenessMs: 24 * HOUR,
    affectedFeatures: ["FlareProbability", "Alerts"],
    directFetch: false,
    statusUrl: "https://www.swpc.noaa.gov/products/3-day-forecast",
  },

  "noaa-sunspots": {
    id: "noaa-sunspots",
    label: "Sunspot Number",
    provider: "NOAA SWPC",
    description:
      "Monthly international sunspot number for solar cycle tracking.",
    queryKeys: [["solar", "sunspots"]],
    endpoint: "/api/solar/sunspots",
    expectedFreshnessMs: 6 * HOUR,
    criticalStalenessMs: 24 * HOUR,
    affectedFeatures: ["SolarCycleContext", "ModelAccuracyPanel"],
    directFetch: false,
    statusUrl: "https://www.swpc.noaa.gov/products/solar-cycle-progression",
  },

  "noaa-xray": {
    id: "noaa-xray",
    label: "X-Ray Flux",
    provider: "NOAA SWPC (GOES satellite)",
    description:
      "GOES 0.1-0.8 nm X-ray flux for solar flare and radio blackout detection.",
    queryKeys: [["solar", "xray"]],
    endpoint: "/api/solar/xray",
    expectedFreshnessMs: 5 * MINUTE,
    criticalStalenessMs: 30 * MINUTE,
    affectedFeatures: ["PrimaryMetrics", "Alerts"],
    directFetch: false,
    statusUrl: "https://www.swpc.noaa.gov/products/goes-x-ray-flux",
  },

  "noaa-protons": {
    id: "noaa-protons",
    label: "Proton Flux",
    provider: "NOAA SWPC (GOES satellite)",
    description:
      "GOES integral proton flux (>=10 MeV) for solar radiation storm detection.",
    queryKeys: [["solar", "protons"]],
    endpoint: "/api/solar/protons",
    expectedFreshnessMs: 5 * MINUTE,
    criticalStalenessMs: 30 * MINUTE,
    affectedFeatures: ["PrimaryMetrics", "Alerts"],
    directFetch: false,
    statusUrl: "https://www.swpc.noaa.gov/products/goes-proton-flux",
  },

  "noaa-dst": {
    id: "noaa-dst",
    label: "Dst Index",
    provider: "NOAA SWPC",
    description:
      "Disturbance Storm Time index for geomagnetic storm intensity measurement.",
    queryKeys: [["solar", "dst"]],
    endpoint: "/api/solar/dst",
    expectedFreshnessMs: 30 * MINUTE,
    criticalStalenessMs: 2 * HOUR,
    affectedFeatures: ["PrimaryMetrics", "Alerts"],
    directFetch: false,
    statusUrl: "https://www.swpc.noaa.gov/products/usgs-1-min-dst",
  },

  "noaa-drap": {
    id: "noaa-drap",
    label: "D-RAP",
    provider: "NOAA SWPC",
    description:
      "D-Region Absorption Prediction showing global HF absorption levels.",
    queryKeys: [["solar", "drap"]],
    endpoint: "/api/solar/drap",
    expectedFreshnessMs: 15 * MINUTE,
    criticalStalenessMs: 1 * HOUR,
    affectedFeatures: ["DRAPOverlay", "SolarPulse"],
    directFetch: false,
    statusUrl:
      "https://www.swpc.noaa.gov/products/d-region-absorption-predictions-d-rap",
  },

  "noaa-flux-forecast": {
    id: "noaa-flux-forecast",
    label: "Flux Forecast",
    provider: "NOAA SWPC",
    description: "3-day solar flux and geomagnetic activity forecast.",
    queryKeys: [["solar", "flux-forecast"]],
    endpoint: "/api/solar/flux-forecast",
    expectedFreshnessMs: 4 * HOUR,
    criticalStalenessMs: 24 * HOUR,
    affectedFeatures: ["SolarFluxChart", "BandConditions"],
    directFetch: false,
    statusUrl: "https://www.swpc.noaa.gov/products/3-day-forecast",
  },

  "nasa-cme": {
    id: "nasa-cme",
    label: "CME Analysis",
    provider: "NASA DONKI",
    description:
      "Coronal Mass Ejection analysis data for Earth-directed CME events.",
    queryKeys: [["solar", "cme"]],
    endpoint: "/api/solar/cme",
    expectedFreshnessMs: 1 * HOUR,
    criticalStalenessMs: 6 * HOUR,
    affectedFeatures: ["CMEAnalysisPanel"],
    directFetch: false,
    statusUrl: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/",
  },

  // ---------------------------------------------------------------------------
  // Direct-fetch sources (fetched via useEffect in SolarPulse, no React Query)
  // ---------------------------------------------------------------------------

  "swpc-scales": {
    id: "swpc-scales",
    label: "NOAA Scales",
    provider: "NOAA SWPC",
    description:
      "Current NOAA Space Weather Scales (R/S/G) for radio blackouts, solar radiation storms, and geomagnetic storms.",
    queryKeys: [],
    endpoint: "https://services.swpc.noaa.gov/products/noaa-scales.json",
    expectedFreshnessMs: 5 * MINUTE,
    criticalStalenessMs: 30 * MINUTE,
    affectedFeatures: ["SolarPulse", "EventAlert"],
    directFetch: true,
    statusUrl: "https://www.swpc.noaa.gov/products/noaa-scales",
  },

  "swpc-alerts": {
    id: "swpc-alerts",
    label: "SWPC Alerts",
    provider: "NOAA SWPC",
    description:
      "Official SWPC alerts, watches, and warnings for space weather events.",
    queryKeys: [],
    endpoint: "https://services.swpc.noaa.gov/products/alerts.json",
    expectedFreshnessMs: 1 * MINUTE,
    criticalStalenessMs: 10 * MINUTE,
    affectedFeatures: ["SolarPulse", "EventAlert"],
    directFetch: true,
    statusUrl: "https://www.swpc.noaa.gov/products/alerts-watches-and-warnings",
  },

  "swpc-xray-latest": {
    id: "swpc-xray-latest",
    label: "X-Ray Flares (Latest)",
    provider: "NOAA SWPC (GOES satellite)",
    description: "Latest GOES X-ray flare classification and timing data.",
    queryKeys: [],
    endpoint:
      "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json",
    expectedFreshnessMs: 1 * MINUTE,
    criticalStalenessMs: 10 * MINUTE,
    affectedFeatures: ["SolarPulse", "PrimaryMetrics"],
    directFetch: true,
    statusUrl: "https://www.swpc.noaa.gov/products/goes-x-ray-flux",
  },

  "swpc-solar-wind-mag": {
    id: "swpc-solar-wind-mag",
    label: "Solar Wind Mag (5-min)",
    provider: "NOAA SWPC (DSCOVR satellite)",
    description:
      "5-minute resolution DSCOVR solar wind magnetic field data (Bx, By, Bz, Bt).",
    queryKeys: [],
    endpoint:
      "https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json",
    expectedFreshnessMs: 5 * MINUTE,
    criticalStalenessMs: 30 * MINUTE,
    affectedFeatures: ["SolarPulse", "BzChart"],
    directFetch: true,
    statusUrl: "https://www.swpc.noaa.gov/products/real-time-solar-wind",
  },

  "swpc-solar-wind-plasma": {
    id: "swpc-solar-wind-plasma",
    label: "Solar Wind Plasma (5-min)",
    provider: "NOAA SWPC (DSCOVR satellite)",
    description:
      "5-minute resolution DSCOVR solar wind plasma data (density, speed, temperature).",
    queryKeys: [],
    endpoint:
      "https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json",
    expectedFreshnessMs: 5 * MINUTE,
    criticalStalenessMs: 30 * MINUTE,
    affectedFeatures: ["SolarPulse", "PrimaryMetrics"],
    directFetch: true,
    statusUrl: "https://www.swpc.noaa.gov/products/real-time-solar-wind",
  },
};

// =============================================================================
// Lookup helpers
// =============================================================================

/** All entries as an iterable array (cached once). */
const ALL_ENTRIES: DataSourceEntry[] = Object.values(DATA_SOURCE_REGISTRY);

/**
 * Find a registry entry by its endpoint path.
 *
 * Normalises the input by stripping a leading `/api/solar/` prefix so that
 * both `"/api/solar/k-index"` and `"k-index"` resolve to the same entry.
 * Also matches full URLs for direct-fetch sources.
 */
export function findSourceByEndpoint(
  endpoint: string,
): DataSourceEntry | undefined {
  // Normalise: strip the proxy prefix if present
  const normalised = endpoint.replace(/^\/api\/solar\//, "");

  return ALL_ENTRIES.find((entry) => {
    // Direct match on the stored endpoint
    if (entry.endpoint === endpoint) return true;

    // Match after stripping the proxy prefix from the stored endpoint too
    const entrySlug = entry.endpoint.replace(/^\/api\/solar\//, "");
    return entrySlug === normalised;
  });
}

/**
 * Find a registry entry whose `queryKeys` contain a matching key.
 *
 * Comparison is element-wise: `["solar", "k-index"]` matches the entry
 * whose `queryKeys` includes `["solar", "k-index"]`.
 */
export function findSourceByQueryKey(
  queryKey: readonly string[],
): DataSourceEntry | undefined {
  return ALL_ENTRIES.find((entry) =>
    entry.queryKeys.some(
      (registeredKey) =>
        registeredKey.length === queryKey.length &&
        registeredKey.every((segment, i) => segment === queryKey[i]),
    ),
  );
}
