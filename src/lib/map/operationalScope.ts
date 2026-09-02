import type { SpotSource } from "@/types/livespot";
import { stripCallsignModifiers } from "@/lib/api/callsignIngestion";

export type MapDataScope = "observe" | "log" | "contest";

export type MapDataProvenance =
  | "public"
  | "station"
  | "session"
  | "selected";

export type MapDataSurface =
  | "liveSpots"
  | "paths"
  | "labels"
  | "activeGrids"
  | "activations"
  | "beacons"
  | "loggedQsos"
  | "contestQsos"
  | "ft8"
  | "selectedTarget"
  | "neededMultipliers";

export interface MapDataPolicy {
  scope: MapDataScope;
  publicAssistance: boolean;
  surfaces: Record<MapDataSurface, readonly MapDataProvenance[]>;
}

export interface MapOperatingSignals {
  manualScope: MapDataScope | null;
  contestActive: boolean;
  stationOperationActive: boolean;
}

type MapLayerFlags = {
  spots: boolean;
  spotTraces: boolean;
  gridActivity: boolean;
  activations: boolean;
  beacons: boolean;
  wspr: boolean;
  ft8Spotter: boolean;
  rayPath: boolean;
  loggedQsos: boolean;
  contestQsos: boolean;
};

const PUBLIC_SPOT_SOURCES = new Set<SpotSource>([
  "PSKReporter",
  "RBN",
  "Cluster",
]);

/** Manual selection is deliberate; automatic precedence applies otherwise. */
export function deriveMapDataScope({
  manualScope,
  contestActive,
  stationOperationActive,
}: MapOperatingSignals): MapDataScope {
  if (manualScope) return manualScope;
  if (contestActive) return "contest";
  if (stationOperationActive) return "log";
  return "observe";
}

/**
 * Build the provenance contract consumed by renderers and overlay engines.
 * Public assistance is meaningful only in contest scope. Observation always
 * permits public discovery; logging intentionally never does.
 */
export function buildMapDataPolicy(
  scope: MapDataScope,
  contestPublicAssistance: boolean,
): MapDataPolicy {
  if (scope === "observe") {
    return {
      scope,
      publicAssistance: true,
      surfaces: {
        liveSpots: ["public", "station"],
        paths: ["public", "station", "selected"],
        labels: ["public", "station", "selected"],
        activeGrids: ["public", "station"],
        activations: ["public"],
        beacons: ["public"],
        loggedQsos: ["station", "session"],
        contestQsos: ["session"],
        ft8: ["station"],
        selectedTarget: ["selected"],
        neededMultipliers: [],
      },
    };
  }

  const publicContestProvenance: MapDataProvenance[] =
    scope === "contest" && contestPublicAssistance ? ["public"] : [];

  return {
    scope,
    publicAssistance:
      scope === "contest" ? contestPublicAssistance : false,
    surfaces: {
      liveSpots: ["station", ...publicContestProvenance],
      paths: ["station", "session", "selected", ...publicContestProvenance],
      labels: ["station", "session", "selected", ...publicContestProvenance],
      activeGrids: ["station", ...publicContestProvenance],
      // Activations and scheduled beacon networks are discovery aids, not
      // contest spotting assistance. They stay out of both focused scopes.
      activations: [],
      beacons: [],
      loggedQsos: scope === "log" ? ["station", "session"] : [],
      contestQsos: scope === "contest" ? ["session"] : [],
      ft8: ["station"],
      selectedTarget: ["selected"],
      neededMultipliers:
        scope === "contest" && contestPublicAssistance
          ? ["public", "session"]
          : scope === "contest"
            ? ["session"]
            : [],
    },
  };
}

export function policyAllows(
  policy: MapDataPolicy,
  surface: MapDataSurface,
  provenance: MapDataProvenance,
): boolean {
  return policy.surfaces[surface].includes(provenance);
}

/** Local WSJT-X reports are station provenance; remote networks are public. */
export function mapSpotSourceProvenance(
  source: string | undefined,
): MapDataProvenance {
  return source === "WSJT-X" ? "station" : "public";
}

/**
 * Restrict the shared live-feed request before network queries and rendering.
 * Focused operation always includes the local WSJT-X source even if an old
 * observation filter omitted it; public sources remain opt-in by policy.
 */
export function selectScopedLiveSpotSources(
  requested: readonly SpotSource[] | undefined,
  policy: MapDataPolicy,
): SpotSource[] | undefined {
  if (policy.scope === "observe") {
    return requested ? [...requested] : undefined;
  }

  const scoped = new Set<SpotSource>(["WSJT-X"]);
  if (policyAllows(policy, "liveSpots", "public")) {
    const requestedPublicSources =
      requested && requested.length > 0
        ? requested
        : [...PUBLIC_SPOT_SOURCES];
    for (const source of requestedPublicSources) {
      if (PUBLIC_SPOT_SOURCES.has(source)) scoped.add(source);
    }
  }
  return [...scoped];
}

/** Keep observation preferences intact and derive focused visibility. */
export function applyMapDataPolicyToLayers<T extends MapLayerFlags>(
  configured: T,
  policy: MapDataPolicy,
): T {
  if (policy.scope === "observe") return configured;

  return {
    ...configured,
    // These surfaces now consume the scoped station/session feed, so enabling
    // them does not re-enable unrelated public traffic.
    spots: true,
    spotTraces: true,
    gridActivity: true,
    ft8Spotter: true,
    rayPath: true,
    activations: false,
    beacons: false,
    wspr: false,
    loggedQsos: policy.scope === "log",
    contestQsos: policy.scope === "contest",
  };
}

/** Normalize portable/mobile suffixes while retaining the exact identity. */
export function stationIdentityKeys(callsign: string | null | undefined): Set<string> {
  const normalized = callsign?.trim().toUpperCase() ?? "";
  if (!normalized) return new Set();
  const base = stripCallsignModifiers(normalized);
  return new Set([normalized, ...(base ? [base] : [])]);
}

export function isOwnStationIdentity(
  candidate: string | null | undefined,
  operator: string | null | undefined,
): boolean {
  const candidateKeys = stationIdentityKeys(candidate);
  const operatorKeys = stationIdentityKeys(operator);
  for (const key of candidateKeys) {
    if (operatorKeys.has(key)) return true;
  }
  return false;
}
