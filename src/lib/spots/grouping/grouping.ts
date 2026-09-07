import {
  clusterGroupSchema,
  groupingPreferencesSchema,
  type ClusterGroup,
  type NormalizedSpotReport,
  type SpotLocation,
  type SpotPresentationPreferences,
} from "@/lib/views/spotContracts";
import { countryMatchFromCode, lookupRegion, type GeographyMatch } from "./lookup";
import { maidenheadCenter, maidenheadFromCoordinates } from "./maidenhead";
import { SPOT_GEOGRAPHY_VERSION } from "./version";

export type GroupingPreferences = SpotPresentationPreferences["grouping"];
export type GroupingDetail = GroupingPreferences["detail"];
export type GroupPrecision = ClusterGroup["precision"];

export interface GroupingOptions {
  geographyVersion?: string;
  expandedIds?: readonly string[];
}

export interface GroupingResult {
  groups: ClusterGroup[];
  singles: string[];
  /** Reachable group IDs for expansion sync, including hidden expanded parents. */
  liveGroupIds: string[];
}

const DETAIL_ORDER: readonly GroupingDetail[] = ["regions", "grid4", "grid6"];

interface Assignment {
  id: string;
  detail: GroupingDetail;
  region: ClusterGroup["region"];
  grid: ClusterGroup["grid"];
  precision: GroupPrecision;
  anchor: { lat: number; lon: number };
  label: string;
}

export function groupMappedReports(
  reports: readonly NormalizedSpotReport[],
  preferences: GroupingPreferences,
  options: GroupingOptions = {},
): GroupingResult {
  const prefs = groupingPreferencesSchema.parse(preferences);
  const geographyVersion = options.geographyVersion?.trim() || SPOT_GEOGRAPHY_VERSION;
  const expanded = new Set(options.expandedIds ?? []);
  const byId = new Map(reports.map((report) => [report.id, report]));
  const liveGroupIds = uniqueSorted(
    reports.flatMap((report) => reachableGroupIds(report, geographyVersion)),
  );

  if (!prefs.enabled) {
    return { groups: [], singles: sortReportIds([...byId.keys()], byId), liveGroupIds };
  }

  const buckets = new Map<string, { assignment: Assignment; ids: string[] }>();
  const singles: string[] = [];

  for (const report of reports) {
    const assignment = assignWithExpansion(report, prefs.detail, expanded, geographyVersion);
    if (!assignment) {
      singles.push(report.id);
      continue;
    }
    const bucket = buckets.get(assignment.id);
    if (bucket) bucket.ids.push(report.id);
    else buckets.set(assignment.id, { assignment, ids: [report.id] });
  }

  const groups: ClusterGroup[] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => a.assignment.id.localeCompare(b.assignment.id))) {
    const reportIds = sortReportIds(bucket.ids, byId);
    if (reportIds.length < prefs.minGroupSize) {
      singles.push(...reportIds);
      continue;
    }
    groups.push(clusterGroupSchema.parse({
      id: bucket.assignment.id,
      geographyVersion,
      endpointRole: "dx",
      label: bucket.assignment.label,
      detail: bucket.assignment.detail,
      region: bucket.assignment.region,
      grid: bucket.assignment.grid,
      precision: bucket.assignment.precision,
      anchor: bucket.assignment.anchor,
      reportIds,
    }));
  }

  return {
    groups,
    singles: sortReportIds(singles, byId),
    liveGroupIds,
  };
}

function assignWithExpansion(
  report: NormalizedSpotReport,
  requested: GroupingDetail,
  expanded: ReadonlySet<string>,
  geographyVersion: string,
): Assignment | null {
  const chain = detailChain(report.dx.location, requested);
  for (const detail of chain) {
    const assignment = assignAtDetail(report, detail, geographyVersion);
    if (!assignment) continue;
    if (!expanded.has(assignment.id)) return assignment;
  }
  return null;
}

function detailChain(location: SpotLocation, requested: GroupingDetail): GroupingDetail[] {
  const capable = DETAIL_ORDER.filter((detail) => canOccupy(location, detail));
  const requestedRank = DETAIL_ORDER.indexOf(requested);
  const atOrBelow = capable.filter((detail) => DETAIL_ORDER.indexOf(detail) <= requestedRank);
  if (atOrBelow.length === 0) return [];
  const start = atOrBelow[atOrBelow.length - 1]!;
  return capable.slice(capable.indexOf(start));
}

function canOccupy(location: SpotLocation, detail: GroupingDetail): boolean {
  return assignLocation(location, detail) !== null;
}

function reachableGroupIds(report: NormalizedSpotReport, geographyVersion: string): string[] {
  const ids: string[] = [];
  for (const detail of DETAIL_ORDER) {
    const assignment = assignAtDetail(report, detail, geographyVersion);
    if (assignment) ids.push(assignment.id);
  }
  return ids;
}

function assignAtDetail(
  report: NormalizedSpotReport,
  detail: GroupingDetail,
  geographyVersion: string,
): Assignment | null {
  const located = assignLocation(report.dx.location, detail);
  if (!located) return null;
  return {
    ...located,
    id: makeGroupId(geographyVersion, located),
  };
}

function assignLocation(
  location: SpotLocation,
  detail: GroupingDetail,
): Omit<Assignment, "id"> | null {
  if (detail === "regions") return assignRegions(location);
  return assignGrid(location, detail);
}

function assignRegions(location: SpotLocation): Omit<Assignment, "id"> | null {
  const match = regionMatch(location);
  if (!match) return null;
  const precision = precisionOf(location);
  if (!precision) return null;
  return {
    detail: "regions",
    region: match.region,
    grid: null,
    precision,
    anchor: match.anchor,
    label: match.region.name,
  };
}

function assignGrid(
  location: SpotLocation,
  detail: "grid4" | "grid6",
): Omit<Assignment, "id"> | null {
  const length = detail === "grid4" ? 4 : 6;
  const grid = gridFor(location, length);
  if (!grid) return null;
  return {
    detail,
    region: null,
    grid: grid.grid,
    precision: location.kind === "reported-grid" ? "reported-grid" : "reported-coordinate",
    anchor: grid.anchor,
    label: grid.grid,
  };
}

function regionMatch(location: SpotLocation): GeographyMatch | null {
  if (location.kind === "unavailable") return null;
  if (location.kind === "approximate") {
    const code = location.region?.countryCode;
    if (!code) return null;
    const name = location.region?.kind === "country" ? location.region.name : undefined;
    return countryMatchFromCode(code, name);
  }
  const allowSubdivision = location.kind === "reported-coordinate"
    || (location.kind === "reported-grid" && location.grid.length >= 4);
  return lookupRegion(location.coordinates.lat, location.coordinates.lon, allowSubdivision);
}

function gridFor(
  location: SpotLocation,
  length: 4 | 6,
): { grid: string; anchor: { lat: number; lon: number } } | null {
  if (location.kind === "unavailable" || location.kind === "approximate") return null;
  if (location.kind === "reported-grid") {
    if (location.grid.length < length) return null;
    const grid = location.grid.slice(0, length);
    const anchor = maidenheadCenter(grid);
    return anchor ? { grid, anchor } : null;
  }
  const grid = maidenheadFromCoordinates(location.coordinates.lat, location.coordinates.lon, length);
  if (!grid) return null;
  const anchor = maidenheadCenter(grid);
  return anchor ? { grid, anchor } : null;
}

function precisionOf(location: SpotLocation): GroupPrecision | null {
  if (location.kind === "approximate") return "approximate";
  if (location.kind === "reported-grid") return "reported-grid";
  if (location.kind === "reported-coordinate") return "reported-coordinate";
  return null;
}

function makeGroupId(geographyVersion: string, assignment: Omit<Assignment, "id">): string {
  if (assignment.detail === "regions" && assignment.region) {
    return `g:${geographyVersion}:dx:regions:${assignment.region.id}:${assignment.precision}`;
  }
  return `g:${geographyVersion}:dx:${assignment.detail}:${assignment.grid}:${assignment.precision}`;
}

function sortReportIds(ids: readonly string[], byId: Map<string, NormalizedSpotReport>): string[] {
  return [...ids].sort((a, b) => {
    const left = byId.get(a);
    const right = byId.get(b);
    const leftMs = left?.observedAtMs ?? 0;
    const rightMs = right?.observedAtMs ?? 0;
    if (leftMs !== rightMs) return rightMs - leftMs;
    return a.localeCompare(b);
  });
}

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}
