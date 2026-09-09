import { getBandFromFrequency } from "@/lib/api/dxcluster";
import {
  buildMapDataPolicy,
  mapSpotSourceProvenance,
  policyAllows,
  type MapDataScope,
} from "@/lib/map/operationalScope";
import { createSpotPreferences } from "@/lib/views/defaults";
import {
  contractIdSchema,
  normalizedSpotReportSchema,
  pathDescriptorSchema,
  spotSceneModelSchema,
  type NormalizedSpotReport,
  type PathDescriptor,
  type SpotPresentationPreferences,
  type SpotSceneModel,
  type StationEndpoint,
} from "@/lib/views/spotContracts";
import type { LiveSpot, SpotSource } from "@/types/livespot";
import {
  mergeDuplicateGroup,
  observationKey,
  stableReportId,
} from "./identity";
import {
  isApproximateLocation,
  isMappedLocation,
  resolveStationEndpoint,
} from "./location";
import { modeMatchesSelection, normalizeMode, normalizeModeSelection } from "./modes";

type SpotFilterPreferences = SpotPresentationPreferences["filters"];

const ALL_SOURCES: readonly SpotSource[] = ["PSKReporter", "RBN", "Cluster", "WSJT-X"];

export interface SpotPipelineOperatingContext {
  scope: MapDataScope;
  contestPublicAssistance?: boolean;
}

export interface BuildSpotSceneInput {
  observations: readonly LiveSpot[];
  nowMs: number;
  preferences?: SpotPresentationPreferences;
  operating?: SpotPipelineOperatingContext;
  /** Enabled, authorized feeds. Empty filter.sources means all of these. */
  authorizedSources?: readonly SpotSource[];
}

export interface SpotPipelineStage {
  loaded: NormalizedSpotReport[];
  deduplicated: NormalizedSpotReport[];
  scopeEligible: NormalizedSpotReport[];
  matching: NormalizedSpotReport[];
}

/**
 * Malformed observations are dropped before `loaded`.
 * `counts.loaded` is successfully normalized reports, not raw input length.
 */
function observedAtMs(time: LiveSpot["time"]): number | null {
  const ms = time instanceof Date ? time.getTime() : Date.parse(String(time));
  if (!Number.isSafeInteger(ms) || ms < 0) return null;
  return ms;
}

function normalizeBand(band: string | undefined, frequencyKhz: number): string {
  const fromSpot = band?.trim().toLowerCase();
  if (fromSpot && /^[a-z0-9.]{1,16}$/.test(fromSpot)) return fromSpot;
  const fromFrequency = getBandFromFrequency(frequencyKhz).toLowerCase();
  return /^[a-z0-9.]{1,16}$/.test(fromFrequency) ? fromFrequency : "unknown";
}

function isReceptionSource(source: SpotSource): boolean {
  return source === "PSKReporter" || source === "RBN" || source === "WSJT-X";
}

function resolveReporter(spot: LiveSpot): StationEndpoint | null {
  const explicitReceiver = spot.receiverCallsign?.trim().slice(0, 32);
  if (isReceptionSource(spot.source)) {
    const call = (explicitReceiver || spot.spotter || "").trim().slice(0, 32);
    if (!call) return null;
    return resolveStationEndpoint(call, "receiver", {
      lat: spot.spotterLat,
      lon: spot.spotterLon,
      grid: spot.receiverGrid ?? spot.spotterGrid,
      locApprox: spot.spotterLocApprox,
    });
  }
  if (explicitReceiver) {
    return resolveStationEndpoint(explicitReceiver, "receiver", {
      grid: spot.receiverGrid,
    });
  }
  const poster = (spot.spotter || "").trim().slice(0, 32);
  if (!poster) return null;
  return resolveStationEndpoint(poster, "posting-service", {
    lat: spot.spotterLat,
    lon: spot.spotterLon,
    grid: spot.spotterGrid,
    locApprox: spot.spotterLocApprox,
  });
}

function reportObservationKey(report: NormalizedSpotReport): string {
  return observationKey({
    dx: report.dx.callsign,
    reporter: report.reporter?.callsign ?? null,
    reporterRole: report.reporter?.role ?? null,
    observedAtMs: report.observedAtMs,
    frequencyKhz: report.frequencyKhz,
    mode: report.mode.name,
    source: report.source,
    sourceReportId: report.sourceReportId,
  });
}

export function intersectAuthorizedSources(
  selected: readonly SpotSource[],
  authorized: readonly SpotSource[],
): SpotSource[] {
  const allowed = new Set(authorized);
  const pool = selected.length > 0 ? selected : authorized;
  return pool.filter((source) => allowed.has(source));
}

export function sourceIsEligible(
  source: SpotSource,
  operating: SpotPipelineOperatingContext | undefined,
  authorizedSources: readonly SpotSource[],
): boolean {
  if (!authorizedSources.includes(source)) return false;
  const policy = buildMapDataPolicy(
    operating?.scope ?? "observe",
    operating?.contestPublicAssistance ?? false,
  );
  return policyAllows(policy, "liveSpots", mapSpotSourceProvenance(source));
}

/** Sources that simultaneously satisfy selection, authorization, and operating policy. */
export function eligibleMatchingSources(
  report: NormalizedSpotReport,
  selected: readonly SpotSource[],
  authorizedSources: readonly SpotSource[],
  operating?: SpotPipelineOperatingContext,
): SpotSource[] {
  const selectedAuthorized = new Set(intersectAuthorizedSources(selected, authorizedSources));
  const seen = new Set<SpotSource>();
  for (const ref of report.sourceRefs) {
    if (selectedAuthorized.has(ref.source) && sourceIsEligible(ref.source, operating, authorizedSources)) {
      seen.add(ref.source);
    }
  }
  return [...seen];
}

export function normalizeLiveSpot(
  spot: LiveSpot,
  usedIds: Map<string, string>,
): NormalizedSpotReport | null {
  const frequencyKhz = spot.frequency;
  if (!(frequencyKhz > 0) || !Number.isFinite(frequencyKhz)) return null;
  const dxCall = (spot.dx ?? "").trim().slice(0, 32);
  if (!dxCall) return null;
  const observed = observedAtMs(spot.time);
  if (observed === null) return null;
  const source = spot.source;
  const mode = normalizeMode(spot.mode);
  const dx = resolveStationEndpoint(dxCall, "transmitter", {
    lat: spot.dxLat,
    lon: spot.dxLon,
    grid: spot.dxGrid,
    locApprox: spot.dxLocApprox,
  });
  const reporter = resolveReporter(spot);
  const sourceReportId = spot.id?.trim() ? spot.id.trim().slice(0, 256) : null;
  const key = observationKey({
    dx: dx.callsign,
    reporter: reporter?.callsign ?? null,
    reporterRole: reporter?.role ?? null,
    observedAtMs: observed,
    frequencyKhz,
    mode: mode.name,
    source,
    sourceReportId,
  });
  const candidate = {
    id: stableReportId(key, usedIds),
    source,
    sourceReportId,
    sourceRefs: [{ source, sourceReportId }],
    observedAtMs: observed,
    frequencyKhz,
    band: normalizeBand(spot.band, frequencyKhz),
    mode,
    dx,
    reporter,
    snrDb: typeof spot.snr === "number" && Number.isFinite(spot.snr) ? spot.snr : null,
  };
  const parsed = normalizedSpotReportSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function deduplicateReports(reports: readonly NormalizedSpotReport[]): NormalizedSpotReport[] {
  const usedIds = new Map<string, string>();
  const grouped = new Map<string, NormalizedSpotReport[]>();
  for (const report of reports) {
    const key = reportObservationKey(report);
    const group = grouped.get(key);
    if (group) group.push(report);
    else grouped.set(key, [report]);
  }
  return [...grouped.values()].map((group) => {
    const merged = mergeDuplicateGroup(group);
    return { ...merged, id: stableReportId(reportObservationKey(merged), usedIds) };
  });
}

export function reportMatchesFilters(
  report: NormalizedSpotReport,
  filters: SpotFilterPreferences,
  nowMs: number,
  authorizedSources: readonly SpotSource[],
  operating?: SpotPipelineOperatingContext,
): boolean {
  const modes = normalizeModeSelection(filters.modes);
  if (!modeMatchesSelection(report.mode, modes)) return false;
  const bands = new Set(filters.bands.map((band) => band.toLowerCase()));
  if (bands.size > 0 && !bands.has(report.band.toLowerCase())) return false;
  const maxAgeMs = filters.maxAgeMinutes * 60_000;
  if (nowMs - report.observedAtMs > maxAgeMs) return false;
  return eligibleMatchingSources(report, filters.sources, authorizedSources, operating).length > 0;
}

/**
 * Restricts to copies whose own source is authorized and in policy, then
 * re-deduplicates so an ineligible primary cannot enrich a permitted duplicate.
 * Pass pre-dedup `loaded` reports, not already-merged rows.
 */
export function applyOperatingScope(
  reports: readonly NormalizedSpotReport[],
  operating: SpotPipelineOperatingContext | undefined,
  authorizedSources: readonly SpotSource[] = ALL_SOURCES,
): NormalizedSpotReport[] {
  return deduplicateReports(
    reports.filter((report) => sourceIsEligible(report.source, operating, authorizedSources)),
  );
}

function compareNewestThenId(a: NormalizedSpotReport, b: NormalizedSpotReport): number {
  if (a.observedAtMs !== b.observedAtMs) return b.observedAtMs - a.observedAtMs;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function selectMappedBudget(
  matching: readonly NormalizedSpotReport[],
  spotLimit: number,
): { mapped: NormalizedSpotReport[]; unlocated: NormalizedSpotReport[]; omitted: NormalizedSpotReport[] } {
  const unlocated = matching.filter((report) => !isMappedLocation(report.dx.location));
  const locatable = matching.filter((report) => isMappedLocation(report.dx.location))
    .slice()
    .sort(compareNewestThenId);
  const limit = Math.min(200, Math.max(10, spotLimit));
  return {
    mapped: locatable.slice(0, limit),
    unlocated,
    omitted: locatable.slice(limit),
  };
}

export interface ViewLiveSpotProjection {
  matching: LiveSpot[];
  mapBudgeted: LiveSpot[];
  matchingCount: number;
  mappedCount: number;
  unlocatedCount: number;
  budgetOmittedCount: number;
}

/**
 * SP-04 matching + map budget on live rows. Keeps the original LiveSpot
 * objects so renderer IDs and provenance stay stable.
 */
export function projectLiveSpotsForView(
  spots: readonly LiveSpot[],
  preferences: SpotPresentationPreferences,
  nowMs: number,
): ViewLiveSpotProjection {
  const usedIds = new Map<string, string>();
  // Raw `spot.id` values are not guaranteed unique across sources/observations.
  // Only adopt one as the renderer id when it hasn't already been claimed by
  // an earlier spot in this batch, otherwise `byReportId` below silently
  // collapses two distinct spots onto one map entry. Falling back to the
  // collision-safe generated id keeps every spot addressable.
  const usedRawIds = new Set<string>();
  const mapped: { spot: LiveSpot; report: NormalizedSpotReport }[] = [];
  for (const spot of spots) {
    const report = normalizeLiveSpot(spot, usedIds);
    if (!report) continue;
    const parsedId = contractIdSchema.safeParse(spot.id);
    const rawId = parsedId.success && !usedRawIds.has(parsedId.data) ? parsedId.data : null;
    if (rawId) usedRawIds.add(rawId);
    mapped.push({
      spot,
      report: rawId ? { ...report, id: rawId } : report,
    });
  }
  const matchingEntries = mapped.filter(({ report }) =>
    reportMatchesFilters(report, preferences.filters, nowMs, ALL_SOURCES),
  );
  const matching = matchingEntries.map((entry) => entry.spot);
  const byReportId = new Map(
    matchingEntries.map((entry) => [entry.report.id, entry.spot]),
  );
  const budget = selectMappedBudget(
    matchingEntries.map((entry) => entry.report),
    preferences.filters.spotLimit,
  );
  return {
    matching,
    mapBudgeted: budget.mapped
      .map((report) => byReportId.get(report.id))
      .filter((spot): spot is LiveSpot => Boolean(spot)),
    matchingCount: matching.length,
    mappedCount: budget.mapped.length,
    unlocatedCount: budget.unlocated.length,
    budgetOmittedCount: budget.omitted.length,
  };
}

function pathKind(report: NormalizedSpotReport): "reported" | "approximate" {
  const fromApprox = isApproximateLocation(report.dx.location);
  const toApprox = report.reporter ? isApproximateLocation(report.reporter.location) : true;
  return fromApprox || toApprox ? "approximate" : "reported";
}

export function pathDescriptorForReport(report: NormalizedSpotReport): PathDescriptor | null {
  const reporter = report.reporter;
  if (!reporter || reporter.role !== "receiver") return null;
  if (!isMappedLocation(report.dx.location) || !isMappedLocation(reporter.location)) return null;
  return pathDescriptorSchema.parse({
    id: `p${report.id}`,
    reportIds: [report.id],
    kind: pathKind(report),
    from: report.dx,
    to: reporter,
    direction: "from-to",
    model: null,
  });
}

export function buildSpotPipelineStages(input: BuildSpotSceneInput): SpotPipelineStage {
  const usedIds = new Map<string, string>();
  const loaded = input.observations
    .map((spot) => normalizeLiveSpot(spot, usedIds))
    .filter((report): report is NormalizedSpotReport => report !== null);
  const deduplicated = deduplicateReports(loaded).sort(compareNewestThenId);
  const authorized = input.authorizedSources ?? ALL_SOURCES;
  const scopeEligible = applyOperatingScope(loaded, input.operating, authorized)
    .sort(compareNewestThenId);
  const preferences = input.preferences ?? createSpotPreferences();
  const matching = scopeEligible.filter((report) =>
    reportMatchesFilters(report, preferences.filters, input.nowMs, authorized, input.operating),
  );
  return { loaded, deduplicated, scopeEligible, matching };
}

/**
 * Pure scene builder. Grouping is identity-only until SP-05; every mapped
 * budgeted report is a single. Camera is not an input.
 */
export function buildSpotSceneModel(input: BuildSpotSceneInput): SpotSceneModel {
  const stages = buildSpotPipelineStages(input);
  const preferences = input.preferences ?? createSpotPreferences();
  const budget = selectMappedBudget(stages.matching, preferences.filters.spotLimit);
  const reports = budget.mapped.slice().sort(compareNewestThenId);
  const paths = reports
    .map(pathDescriptorForReport)
    .filter((path): path is PathDescriptor => path !== null);
  return spotSceneModelSchema.parse({
    schemaVersion: 1,
    nowMs: input.nowMs,
    reports,
    groups: [],
    singles: reports.map((report) => report.id),
    paths,
    counts: {
      loaded: stages.loaded.length,
      deduplicated: stages.deduplicated.length,
      scopeEligible: stages.scopeEligible.length,
      matching: stages.matching.length,
      unlocated: budget.unlocated.length,
      mapped: reports.length,
      budgetOmitted: budget.omitted.length,
    },
  });
}

export function defaultSpotFilters(): SpotFilterPreferences {
  return createSpotPreferences().filters;
}

export function isDefaultSpotFilters(filters: SpotFilterPreferences): boolean {
  const defaults = defaultSpotFilters();
  const modes = normalizeModeSelection(filters.modes);
  return (
    modes.all &&
    modes.includeUnknown === defaults.modes.includeUnknown &&
    modes.includeInferred === defaults.modes.includeInferred &&
    filters.bands.length === 0 &&
    filters.sources.length === 0 &&
    filters.maxAgeMinutes === defaults.maxAgeMinutes &&
    filters.spotLimit === defaults.spotLimit
  );
}
