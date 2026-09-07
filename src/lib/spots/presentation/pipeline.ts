import { getBandFromFrequency } from "@/lib/api/dxcluster";
import {
  buildMapDataPolicy,
  mapSpotSourceProvenance,
  policyAllows,
  type MapDataScope,
} from "@/lib/map/operationalScope";
import { createSpotPreferences } from "@/lib/views/defaults";
import {
  pathDescriptorSchema,
  spotSceneModelSchema,
  type NormalizedSpotReport,
  type PathDescriptor,
  type SpotPresentationPreferences,
  type SpotSceneModel,
} from "@/lib/views/spotContracts";
import type { LiveSpot, SpotSource } from "@/types/livespot";
import {
  mergeDuplicateReports,
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

function observedAtMs(time: LiveSpot["time"]): number {
  if (time instanceof Date) return time.getTime();
  const parsed = Date.parse(String(time));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBand(band: string | undefined, frequencyKhz: number): string {
  const fromSpot = band?.trim().toLowerCase();
  if (fromSpot && /^[a-z0-9.]{1,16}$/.test(fromSpot)) return fromSpot;
  const fromFrequency = getBandFromFrequency(frequencyKhz).toLowerCase();
  return /^[a-z0-9.]{1,16}$/.test(fromFrequency) ? fromFrequency : "unknown";
}

function reporterRole(source: SpotSource, locationKind: string): StationEndpointRole {
  if (source === "Cluster" && locationKind !== "reported-coordinate" && locationKind !== "reported-grid") {
    return "posting-service";
  }
  return "receiver";
}

type StationEndpointRole = "transmitter" | "receiver" | "posting-service" | "unknown";

export function normalizeLiveSpot(
  spot: LiveSpot,
  usedIds: Map<string, string>,
): NormalizedSpotReport | null {
  const frequencyKhz = spot.frequency;
  if (!(frequencyKhz > 0) || !Number.isFinite(frequencyKhz)) return null;
  const dxCall = (spot.dx ?? "").trim().slice(0, 32);
  if (!dxCall) return null;
  const source = spot.source;
  const mode = normalizeMode(spot.mode);
  const reporterCall = (spot.receiverCallsign ?? spot.spotter ?? "").trim().slice(0, 32);
  const dx = resolveStationEndpoint(dxCall, "transmitter", {
    lat: spot.dxLat,
    lon: spot.dxLon,
    grid: spot.dxGrid,
    locApprox: spot.dxLocApprox,
  });
  const reporter = reporterCall
    ? resolveStationEndpoint(reporterCall, "unknown", {
      lat: spot.spotterLat,
      lon: spot.spotterLon,
      grid: spot.spotterGrid ?? spot.receiverGrid,
      locApprox: spot.spotterLocApprox,
    })
    : null;
  if (reporter) {
    reporter.role = reporterRole(source, reporter.location.kind);
  }
  const observed = observedAtMs(spot.time);
  const sourceReportId = spot.id?.trim() ? spot.id.trim().slice(0, 256) : null;
  const key = observationKey({
    dx: dx.callsign,
    reporter: reporter ? reporter.callsign : null,
    observedAtMs: observed,
    frequencyKhz,
    mode: mode.name,
    source,
    sourceReportId,
  });
  return {
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
}

export function deduplicateReports(reports: readonly NormalizedSpotReport[]): NormalizedSpotReport[] {
  const usedIds = new Map<string, string>();
  const grouped = new Map<string, NormalizedSpotReport>();
  for (const report of reports) {
    const key = observationKey({
      dx: report.dx.callsign,
      reporter: report.reporter?.callsign ?? null,
      observedAtMs: report.observedAtMs,
      frequencyKhz: report.frequencyKhz,
      mode: report.mode.name,
      source: report.source,
      sourceReportId: report.sourceReportId,
    });
    const existing = grouped.get(key);
    grouped.set(key, existing ? mergeDuplicateReports(existing, report) : report);
  }
  return [...grouped.values()].map((report) => {
    const key = observationKey({
      dx: report.dx.callsign,
      reporter: report.reporter?.callsign ?? null,
      observedAtMs: report.observedAtMs,
      frequencyKhz: report.frequencyKhz,
      mode: report.mode.name,
      source: report.source,
      sourceReportId: report.sourceReportId,
    });
    return { ...report, id: stableReportId(key, usedIds) };
  });
}

export function reportMatchesFilters(
  report: NormalizedSpotReport,
  filters: SpotFilterPreferences,
  nowMs: number,
  authorizedSources: readonly SpotSource[],
): boolean {
  const modes = normalizeModeSelection(filters.modes);
  if (!modeMatchesSelection(report.mode, modes)) return false;
  const bands = new Set(filters.bands.map((band) => band.toLowerCase()));
  if (bands.size > 0 && !bands.has(report.band.toLowerCase())) return false;
  const maxAgeMs = filters.maxAgeMinutes * 60_000;
  if (nowMs - report.observedAtMs > maxAgeMs) return false;
  const enabled = filters.sources.length > 0
    ? filters.sources
    : authorizedSources;
  const allowed = new Set(enabled);
  return report.sourceRefs.some((ref) => allowed.has(ref.source));
}

export function applyOperatingScope(
  reports: readonly NormalizedSpotReport[],
  operating: SpotPipelineOperatingContext | undefined,
): NormalizedSpotReport[] {
  const policy = buildMapDataPolicy(
    operating?.scope ?? "observe",
    operating?.contestPublicAssistance ?? false,
  );
  return reports.filter((report) =>
    report.sourceRefs.some((ref) =>
      policyAllows(policy, "liveSpots", mapSpotSourceProvenance(ref.source)),
    ),
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
  const scopeEligible = applyOperatingScope(deduplicated, input.operating);
  const preferences = input.preferences ?? createSpotPreferences();
  const authorized = input.authorizedSources ?? ["PSKReporter", "RBN", "Cluster", "WSJT-X"];
  const matching = scopeEligible.filter((report) =>
    reportMatchesFilters(report, preferences.filters, input.nowMs, authorized),
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
