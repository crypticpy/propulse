import type { SolarSourceId } from "./contracts";

export type SolarSourceGroup = "now" | "impacts" | "forecast" | "details";
export type SolarCriticality = "critical" | "supporting" | "optional";

export interface SolarSourcePolicy {
  id: SolarSourceId;
  label: string;
  provider: string;
  product: string;
  endpoint: `/api/solar/${string}`;
  sourceUrl: string;
  softTtlMs: number;
  hardTtlMs: number;
  refetchMs: number;
  requestDeadlineMs: number;
  retries: number;
  maxRows: number;
  /** Maximum bytes accepted from the provider before normalization. */
  maxUpstreamBytes: number;
  /** Maximum bytes serialized in the compact same-origin envelope. */
  maxBytes: number;
  criticality: SolarCriticality;
  group: SolarSourceGroup;
  /** Snapshot products can be current even when their newest event is old. */
  freshnessBasis?: "observedAt" | "fetchedAt";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function policy(
  value: Omit<SolarSourcePolicy, "requestDeadlineMs" | "retries"> &
    Partial<Pick<SolarSourcePolicy, "requestDeadlineMs" | "retries">>,
): SolarSourcePolicy {
  return { requestDeadlineMs: 8_000, retries: 2, ...value };
}

export const SOLAR_SOURCE_POLICIES: Record<
  SolarSourceId,
  SolarSourcePolicy
> = {
  "noaa-k-index": policy({
    id: "noaa-k-index",
    label: "Planetary Kp",
    provider: "NOAA SWPC",
    product: "3-hour observed, estimated, and predicted planetary Kp",
    endpoint: "/api/solar/k-index",
    sourceUrl:
      "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
    softTtlMs: 5 * MINUTE,
    hardTtlMs: 30 * MINUTE,
    refetchMs: 2 * MINUTE,
    maxRows: 72,
    maxUpstreamBytes: 96_000,
    maxBytes: 48_000,
    criticality: "critical",
    group: "now",
    // The timestamp identifies the start of a three-hour Kp bucket. Treat the
    // endpoint as a current snapshot so valid late-bucket estimates survive.
    freshnessBasis: "fetchedAt",
  }),
  "noaa-solar-flux": policy({
    id: "noaa-solar-flux",
    label: "Solar flux",
    provider: "NOAA SWPC",
    product: "Observed 10.7 cm radio flux",
    endpoint: "/api/solar/flux",
    sourceUrl: "https://services.swpc.noaa.gov/json/f107_cm_flux.json",
    softTtlMs: 8 * HOUR,
    hardTtlMs: 36 * HOUR,
    refetchMs: 4 * HOUR,
    maxRows: 45,
    maxUpstreamBytes: 256_000,
    maxBytes: 32_000,
    criticality: "critical",
    group: "now",
  }),
  "noaa-magnetometer": policy({
    id: "noaa-magnetometer",
    label: "Interplanetary magnetic field",
    provider: "NOAA SWPC",
    product: "RTSW one-minute IMF Bz, By, and Bt",
    endpoint: "/api/solar/magnetometer",
    sourceUrl: "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
    softTtlMs: 15 * MINUTE,
    hardTtlMs: HOUR,
    refetchMs: 2 * MINUTE,
    maxRows: 90,
    maxUpstreamBytes: 2_000_000,
    maxBytes: 64_000,
    criticality: "critical",
    group: "now",
  }),
  "noaa-magnetometer-24h": policy({
    id: "noaa-magnetometer-24h",
    label: "IMF Bz, By, and Bt (24 h)",
    provider: "NOAA SWPC",
    product: "RTSW one-minute IMF Bz, By, and Bt, retained for 24 hours",
    endpoint: "/api/solar/magnetometer-24h",
    sourceUrl: "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
    softTtlMs: 5 * MINUTE,
    hardTtlMs: 30 * MINUTE,
    refetchMs: 5 * MINUTE,
    requestDeadlineMs: 12_000,
    maxRows: 1_600,
    maxUpstreamBytes: 2_500_000,
    maxBytes: 200_000,
    criticality: "supporting",
    group: "details",
  }),
  "noaa-probabilities": policy({
    id: "noaa-probabilities",
    label: "Solar-event probabilities",
    provider: "NOAA SWPC",
    product: "One-day flare and >=10 MeV proton probabilities",
    endpoint: "/api/solar/probabilities",
    sourceUrl: "https://services.swpc.noaa.gov/json/solar_probabilities.json",
    softTtlMs: 36 * HOUR,
    hardTtlMs: 3 * DAY,
    refetchMs: 4 * HOUR,
    maxRows: 1,
    maxUpstreamBytes: 64_000,
    maxBytes: 8_000,
    criticality: "supporting",
    group: "forecast",
  }),
  "noaa-sunspots": policy({
    id: "noaa-sunspots",
    label: "Solar cycle",
    provider: "NOAA SWPC",
    product: "Monthly observed sunspot number",
    endpoint: "/api/solar/sunspots",
    sourceUrl:
      "https://services.swpc.noaa.gov/json/solar-cycle/sunspots.json",
    softTtlMs: 65 * DAY,
    hardTtlMs: 120 * DAY,
    refetchMs: DAY,
    maxRows: 36,
    maxUpstreamBytes: 750_000,
    maxBytes: 32_000,
    criticality: "optional",
    group: "details",
  }),
  "noaa-xray": policy({
    id: "noaa-xray",
    label: "GOES X-ray flux",
    provider: "NOAA SWPC",
    product: "GOES 0.1–0.8 nm X-ray flux",
    endpoint: "/api/solar/xray",
    sourceUrl:
      "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json",
    softTtlMs: 5 * MINUTE,
    hardTtlMs: 30 * MINUTE,
    refetchMs: 2 * MINUTE,
    maxRows: 120,
    maxUpstreamBytes: 1_000_000,
    maxBytes: 64_000,
    criticality: "critical",
    group: "now",
  }),
  "noaa-xray-24h": policy({
    id: "noaa-xray-24h",
    label: "GOES X-ray flux (24 h)",
    provider: "NOAA SWPC",
    product: "GOES 0.1–0.8 nm X-ray flux, retained for 24 hours",
    endpoint: "/api/solar/xray-24h",
    sourceUrl:
      "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json",
    softTtlMs: 5 * MINUTE,
    hardTtlMs: 30 * MINUTE,
    refetchMs: 5 * MINUTE,
    requestDeadlineMs: 12_000,
    maxRows: 1_600,
    maxUpstreamBytes: 1_200_000,
    maxBytes: 220_000,
    criticality: "supporting",
    group: "details",
  }),
  "noaa-protons": policy({
    id: "noaa-protons",
    label: "GOES proton flux",
    provider: "NOAA SWPC",
    product: "GOES integral proton flux >=10 MeV",
    endpoint: "/api/solar/protons",
    sourceUrl:
      "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json",
    softTtlMs: 15 * MINUTE,
    hardTtlMs: HOUR,
    refetchMs: 2 * MINUTE,
    maxRows: 120,
    maxUpstreamBytes: 1_500_000,
    maxBytes: 64_000,
    criticality: "supporting",
    group: "impacts",
  }),
  "noaa-dst": policy({
    id: "noaa-dst",
    label: "Dst index",
    provider: "NOAA SWPC / Kyoto WDC",
    product: "Kyoto disturbance storm time index",
    endpoint: "/api/solar/dst",
    sourceUrl: "https://services.swpc.noaa.gov/products/kyoto-dst.json",
    softTtlMs: 2 * HOUR,
    hardTtlMs: 6 * HOUR,
    refetchMs: 15 * MINUTE,
    maxRows: 72,
    maxUpstreamBytes: 128_000,
    maxBytes: 32_000,
    criticality: "supporting",
    group: "impacts",
  }),
  "noaa-drap": policy({
    id: "noaa-drap",
    label: "D-RAP absorption",
    provider: "NOAA SWPC",
    product: "Global D-region absorption prediction grid",
    endpoint: "/api/solar/drap",
    sourceUrl:
      "https://services.swpc.noaa.gov/text/drap_global_frequencies.txt",
    softTtlMs: 15 * MINUTE,
    hardTtlMs: HOUR,
    refetchMs: 15 * MINUTE,
    maxRows: 181,
    maxUpstreamBytes: 750_000,
    maxBytes: 500_000,
    criticality: "optional",
    group: "impacts",
  }),
  "noaa-flux-forecast": policy({
    id: "noaa-flux-forecast",
    label: "Solar and geomagnetic forecast",
    provider: "NOAA SWPC",
    product: "Official 3-day solar flux and A-index prediction",
    endpoint: "/api/solar/flux-forecast",
    sourceUrl:
      "https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt",
    softTtlMs: 8 * HOUR,
    hardTtlMs: 36 * HOUR,
    refetchMs: 4 * HOUR,
    maxRows: 3,
    maxUpstreamBytes: 64_000,
    maxBytes: 24_000,
    criticality: "supporting",
    group: "forecast",
  }),
  "noaa-flux-outlook": policy({
    id: "noaa-flux-outlook",
    label: "27-day solar and geomagnetic outlook",
    provider: "NOAA SWPC",
    product: "27-day outlook of 10.7 cm flux, planetary A index, and largest Kp",
    endpoint: "/api/solar/flux-outlook",
    sourceUrl: "https://services.swpc.noaa.gov/text/27-day-outlook.txt",
    softTtlMs: 12 * HOUR,
    hardTtlMs: 48 * HOUR,
    refetchMs: 6 * HOUR,
    maxRows: 27,
    maxUpstreamBytes: 64_000,
    maxBytes: 16_000,
    criticality: "supporting",
    group: "forecast",
  }),
  "nasa-cme": policy({
    id: "nasa-cme",
    label: "CME analysis",
    provider: "NASA DONKI",
    product: "Most-accurate CME analysis",
    endpoint: "/api/solar/cme",
    sourceUrl:
      "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/CMEAnalysis",
    softTtlMs: HOUR,
    hardTtlMs: 6 * HOUR,
    refetchMs: HOUR,
    requestDeadlineMs: 10_000,
    maxRows: 24,
    maxUpstreamBytes: 1_000_000,
    maxBytes: 160_000,
    criticality: "optional",
    group: "impacts",
    freshnessBasis: "fetchedAt",
  }),
  "swpc-scales": policy({
    id: "swpc-scales",
    label: "NOAA weather scales",
    provider: "NOAA SWPC",
    product: "Current R, S, and G scale levels",
    endpoint: "/api/solar/scales",
    sourceUrl: "https://services.swpc.noaa.gov/products/noaa-scales.json",
    softTtlMs: 5 * MINUTE,
    hardTtlMs: 30 * MINUTE,
    refetchMs: 2 * MINUTE,
    maxRows: 5,
    maxUpstreamBytes: 64_000,
    maxBytes: 16_000,
    criticality: "critical",
    group: "now",
  }),
  "swpc-alerts": policy({
    id: "swpc-alerts",
    label: "Official alerts",
    provider: "NOAA SWPC",
    product: "Alerts, watches, warnings, and summaries",
    endpoint: "/api/solar/alerts",
    sourceUrl: "https://services.swpc.noaa.gov/products/alerts.json",
    softTtlMs: 5 * MINUTE,
    hardTtlMs: 30 * MINUTE,
    refetchMs: MINUTE,
    maxRows: 40,
    maxUpstreamBytes: 500_000,
    maxBytes: 160_000,
    criticality: "critical",
    group: "now",
    freshnessBasis: "fetchedAt",
  }),
  "swpc-xray-latest": policy({
    id: "swpc-xray-latest",
    label: "Latest X-ray flare",
    provider: "NOAA SWPC",
    product: "Latest GOES X-ray flare classification",
    endpoint: "/api/solar/xray-latest",
    sourceUrl:
      "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json",
    softTtlMs: 5 * MINUTE,
    hardTtlMs: 30 * MINUTE,
    refetchMs: 2 * MINUTE,
    maxRows: 1,
    maxUpstreamBytes: 128_000,
    maxBytes: 12_000,
    criticality: "supporting",
    group: "impacts",
    freshnessBasis: "fetchedAt",
  }),
  "swpc-solar-wind-mag": policy({
    id: "swpc-solar-wind-mag",
    label: "Solar-wind magnetic field",
    provider: "NOAA SWPC",
    product: "Latest solar-wind magnetic-field summary",
    endpoint: "/api/solar/wind-mag",
    sourceUrl:
      "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json",
    softTtlMs: 15 * MINUTE,
    hardTtlMs: HOUR,
    refetchMs: 2 * MINUTE,
    maxRows: 1,
    maxUpstreamBytes: 8_000,
    maxBytes: 8_000,
    criticality: "supporting",
    group: "details",
  }),
  "swpc-solar-wind-plasma": policy({
    id: "swpc-solar-wind-plasma",
    label: "Solar-wind plasma",
    provider: "NOAA SWPC",
    product: "RTSW one-minute solar-wind speed and density, retained for 24 hours",
    endpoint: "/api/solar/wind-plasma",
    sourceUrl: "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
    softTtlMs: 15 * MINUTE,
    hardTtlMs: HOUR,
    refetchMs: 2 * MINUTE,
    requestDeadlineMs: 12_000,
    maxRows: 2_500,
    maxUpstreamBytes: 4_000_000,
    maxBytes: 320_000,
    criticality: "supporting",
    group: "details",
  }),
};

export const SOLAR_SOURCE_IDS = Object.keys(
  SOLAR_SOURCE_POLICIES,
) as SolarSourceId[];

export const SOLAR_QUERY_KEYS: Record<
  SolarSourceId,
  readonly ["solar", "v1", string]
> = {
  "noaa-k-index": ["solar", "v1", "k-index"],
  "noaa-solar-flux": ["solar", "v1", "flux"],
  "noaa-magnetometer": ["solar", "v1", "magnetometer"],
  "noaa-magnetometer-24h": ["solar", "v1", "magnetometer-24h"],
  "noaa-probabilities": ["solar", "v1", "probabilities"],
  "noaa-sunspots": ["solar", "v1", "sunspots"],
  "noaa-xray": ["solar", "v1", "xray"],
  "noaa-xray-24h": ["solar", "v1", "xray-24h"],
  "noaa-protons": ["solar", "v1", "protons"],
  "noaa-dst": ["solar", "v1", "dst"],
  "noaa-drap": ["solar", "v1", "drap"],
  "noaa-flux-forecast": ["solar", "v1", "flux-forecast"],
  "noaa-flux-outlook": ["solar", "v1", "flux-outlook"],
  "nasa-cme": ["solar", "v1", "cme"],
  "swpc-scales": ["solar", "v1", "scales"],
  "swpc-alerts": ["solar", "v1", "alerts"],
  "swpc-xray-latest": ["solar", "v1", "xray-latest"],
  "swpc-solar-wind-mag": ["solar", "v1", "wind-mag"],
  "swpc-solar-wind-plasma": ["solar", "v1", "wind-plasma"],
};

export function getSolarSourcePolicy(id: SolarSourceId): SolarSourcePolicy {
  return SOLAR_SOURCE_POLICIES[id];
}

/** Keep edge revalidation cadence independent from observation usability. */
export function getSolarEdgeCacheTtlMs(policy: SolarSourcePolicy): number {
  return Math.min(policy.refetchMs, policy.softTtlMs);
}
