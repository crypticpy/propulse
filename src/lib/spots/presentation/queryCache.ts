import type { MapDataScope } from "@/lib/map/operationalScope";
import type { SpotPresentationPreferences } from "@/lib/views/spotContracts";
import type { SpotSource } from "@/types/livespot";

type SpotFilterPreferences = SpotPresentationPreferences["filters"];
type GroupingPreferences = SpotPresentationPreferences["grouping"];

export interface SharedSpotQueryIdentity {
  sources: readonly SpotSource[] | "all-authorized";
  dataScope: MapDataScope;
  authorization: string;
  windowStartMs: number;
  windowEndMs: number;
  upstreamParams: Record<string, string | number | boolean | null>;
}

export interface ViewSpotMemoIdentity {
  reportRevision: string;
  nowMs: number;
  ageBucketMinutes: number;
  operatingScope: MapDataScope;
  filters: SpotFilterPreferences;
  grouping: GroupingPreferences;
}

function stableRecord(value: Record<string, string | number | boolean | null>): string {
  return JSON.stringify(
    Object.keys(value).sort().map((key) => [key, value[key]]),
  );
}

/**
 * Shared fetch/cache identity. Excludes map budget, camera, grouping and
 * presentation so a 50-report view cannot starve a 200-report view.
 */
export function sharedSpotQueryKey(identity: SharedSpotQueryIdentity): string {
  const sources = identity.sources === "all-authorized"
    ? "all-authorized"
    : [...identity.sources].sort().join(",");
  return [
    "spot-query",
    sources,
    identity.dataScope,
    identity.authorization,
    String(identity.windowStartMs),
    String(identity.windowEndMs),
    stableRecord(identity.upstreamParams),
  ].join("|");
}

/** Per-runtime derivation memo. Includes this view's filters/budget/grouping. */
export function viewSpotMemoKey(identity: ViewSpotMemoIdentity): string {
  return JSON.stringify({
    kind: "spot-view",
    reportRevision: identity.reportRevision,
    nowMs: identity.nowMs,
    ageBucketMinutes: identity.ageBucketMinutes,
    operatingScope: identity.operatingScope,
    filters: identity.filters,
    grouping: identity.grouping,
  });
}

export function reportRevisionFromIds(ids: readonly string[]): string {
  return [...ids].sort().join(",");
}
