/**
 * Application-wide external-source catalog.
 *
 * Solar entries are derived from the executable solar policy registry so
 * query keys, routes, freshness thresholds, and provider names cannot drift.
 * Non-solar sources may be declared locally until they gain their own policy.
 */

import type { SolarSourceId } from "@/lib/solar/contracts";
import {
  SOLAR_QUERY_KEYS,
  SOLAR_SOURCE_IDS,
  SOLAR_SOURCE_POLICIES,
} from "@/lib/solar/sourcePolicies";

export type DataSourceId = SolarSourceId | "celestrak-tle";

export interface DataSourceEntry {
  id: DataSourceId;
  label: string;
  provider: string;
  description: string;
  queryKeys: readonly (readonly string[])[];
  endpoint: string;
  expectedFreshnessMs: number;
  criticalStalenessMs: number;
  affectedFeatures: string[];
  directFetch: boolean;
  statusUrl?: string;
}

const SOLAR_AFFECTED_FEATURES: Record<SolarSourceId, string[]> = {
  "noaa-k-index": ["Solar Pulse now", "Kp history", "general HF guidance"],
  "noaa-solar-flux": ["Solar Pulse now", "SFI history", "general HF guidance"],
  "noaa-magnetometer": ["Solar Pulse now", "Bz history", "general HF guidance"],
  "noaa-probabilities": ["official forecast"],
  "noaa-sunspots": ["solar-cycle context"],
  "noaa-xray": ["Solar Pulse now", "X-ray history"],
  "noaa-protons": ["radiation impacts"],
  "noaa-dst": ["geomagnetic impacts"],
  "noaa-drap": ["absorption impacts"],
  "noaa-flux-forecast": ["official solar and geomagnetic forecast"],
  "nasa-cme": ["CME analysis"],
  "swpc-scales": ["official NOAA scale snapshot"],
  "swpc-alerts": ["official SWPC bulletins"],
  "swpc-xray-latest": ["latest classified flare"],
  "swpc-solar-wind-mag": ["solar-wind detail"],
  "swpc-solar-wind-plasma": ["solar-wind detail"],
};

const solarEntries = Object.fromEntries(
  SOLAR_SOURCE_IDS.map((id) => {
    const policy = SOLAR_SOURCE_POLICIES[id];
    const entry: DataSourceEntry = {
      id,
      label: policy.label,
      provider: policy.provider,
      description: policy.product,
      queryKeys: [SOLAR_QUERY_KEYS[id]],
      endpoint: policy.endpoint,
      expectedFreshnessMs: policy.softTtlMs,
      criticalStalenessMs: policy.hardTtlMs,
      affectedFeatures: SOLAR_AFFECTED_FEATURES[id],
      directFetch: false,
      statusUrl: policy.sourceUrl,
    };
    return [id, entry];
  }),
) as Record<SolarSourceId, DataSourceEntry>;

export const DATA_SOURCE_REGISTRY: Record<DataSourceId, DataSourceEntry> = {
  ...solarEntries,
  "celestrak-tle": {
    id: "celestrak-tle",
    label: "Satellite TLE",
    provider: "Celestrak / NORAD",
    description: "Two-Line Element sets used for satellite orbit prediction.",
    queryKeys: [["satellites", "tle"]],
    endpoint: "/api/satellites/tle",
    expectedFreshnessMs: 3 * 60 * 60_000,
    criticalStalenessMs: 12 * 60 * 60_000,
    affectedFeatures: ["Satellite tracker", "pass predictions", "satellite map"],
    directFetch: false,
    statusUrl: "https://celestrak.org/NORAD/elements/",
  },
};

const ALL_ENTRIES = Object.values(DATA_SOURCE_REGISTRY);

export function findSourceByEndpoint(endpoint: string): DataSourceEntry | undefined {
  const normalized = endpoint.replace(/^\/api\/solar\//, "");
  return ALL_ENTRIES.find((entry) => {
    if (entry.endpoint === endpoint) return true;
    return entry.endpoint.replace(/^\/api\/solar\//, "") === normalized;
  });
}

export function findSourceByQueryKey(
  queryKey: readonly string[],
): DataSourceEntry | undefined {
  return ALL_ENTRIES.find((entry) =>
    entry.queryKeys.some(
      (registered) =>
        registered.length === queryKey.length &&
        registered.every((part, index) => part === queryKey[index]),
    ),
  );
}
