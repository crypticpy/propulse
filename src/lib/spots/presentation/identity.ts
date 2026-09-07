import { stripCallsignModifiers } from "@/lib/api/callsignIngestion";
import {
  spotSourceSchema,
  type NormalizedSpotReport,
  type StationEndpoint,
} from "@/lib/views/spotContracts";
import type { z } from "zod";
import { locationPrecisionRank } from "./location";

type SpotSource = z.infer<typeof spotSourceSchema>;
type ReporterRole = StationEndpoint["role"];

export const SOURCE_PRECEDENCE: readonly SpotSource[] = [
  "PSKReporter",
  "RBN",
  "WSJT-X",
  "Cluster",
];

export function canonicalCallsign(callsign: string | undefined | null): string {
  return stripCallsignModifiers(callsign?.trim() ?? "").slice(0, 32);
}

export function sourcePrecedenceRank(source: SpotSource): number {
  const index = SOURCE_PRECEDENCE.indexOf(source);
  return index === -1 ? SOURCE_PRECEDENCE.length : index;
}

export function hashStableString(input: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export interface ObservationKeyInput {
  dx: string;
  reporter: string | null;
  reporterRole: ReporterRole | null;
  observedAtMs: number;
  frequencyKhz: number;
  mode: string;
  source: SpotSource;
  sourceReportId: string | null;
}

/**
 * Proven receiver identities merge across feeds. Posting-service and unknown
 * reporters stay namespaced by source unless a shared upstream id proves a copy.
 */
export function observationKey(input: ObservationKeyInput): string {
  const dx = canonicalCallsign(input.dx) || input.dx.trim().toUpperCase();
  const reporter = input.reporter && input.reporterRole === "receiver"
    ? canonicalCallsign(input.reporter)
    : "";
  const exact = [
    dx,
    String(input.observedAtMs),
    String(input.frequencyKhz),
    input.mode,
  ].join("|");
  if (reporter) return `rx|${reporter}|${exact}`;
  const localId = input.sourceReportId?.trim() || "";
  return `src|${input.source}|${localId}|${exact}`;
}

export function stableReportId(key: string, used: Map<string, string>): string {
  const hash = hashStableString(key);
  let candidate = `r${hash}`;
  let n = 2;
  while (used.has(candidate) && used.get(candidate) !== key) {
    candidate = `r${hash}-${n}`;
    n += 1;
  }
  used.set(candidate, key);
  return candidate;
}

function canonicalSnapshot(report: NormalizedSpotReport): string {
  return JSON.stringify({
    source: report.source,
    sourceReportId: report.sourceReportId,
    observedAtMs: report.observedAtMs,
    frequencyKhz: report.frequencyKhz,
    band: report.band,
    mode: report.mode,
    dx: report.dx,
    reporter: report.reporter,
    snrDb: report.snrDb,
  });
}

function unavailableLocation(): Extract<NormalizedSpotReport["dx"]["location"], { kind: "unavailable" }> {
  return { kind: "unavailable", reason: "none" };
}

/** Positive when `left` should be the surviving primary. */
export function compareReportsDeterministic(
  left: NormalizedSpotReport,
  right: NormalizedSpotReport,
): number {
  const dxDelta = locationPrecisionRank(left.dx.location) - locationPrecisionRank(right.dx.location);
  if (dxDelta) return dxDelta;
  const sourceDelta = sourcePrecedenceRank(right.source) - sourcePrecedenceRank(left.source);
  if (sourceDelta) return sourceDelta;
  const snrDelta = (left.snrDb !== null ? 1 : 0) - (right.snrDb !== null ? 1 : 0);
  if (snrDelta) return snrDelta;
  const reporterDelta = locationPrecisionRank(left.reporter?.location ?? unavailableLocation())
    - locationPrecisionRank(right.reporter?.location ?? unavailableLocation());
  if (reporterDelta) return reporterDelta;
  const leftSnap = canonicalSnapshot(left);
  const rightSnap = canonicalSnapshot(right);
  if (leftSnap < rightSnap) return 1;
  if (leftSnap > rightSnap) return -1;
  return 0;
}

export function preferReport(
  current: NormalizedSpotReport,
  incoming: NormalizedSpotReport,
): NormalizedSpotReport {
  return compareReportsDeterministic(current, incoming) >= 0 ? current : incoming;
}

export const SOURCE_REF_LIMIT = 32;

function sourceRefStamp(ref: NormalizedSpotReport["sourceRefs"][number]): string {
  return `${ref.source}:${ref.sourceReportId ?? ""}`;
}

function compareSourceRefs(
  left: NormalizedSpotReport["sourceRefs"][number],
  right: NormalizedSpotReport["sourceRefs"][number],
): number {
  const rank = sourcePrecedenceRank(left.source) - sourcePrecedenceRank(right.source);
  if (rank) return rank;
  return (left.sourceReportId ?? "").localeCompare(right.sourceReportId ?? "");
}

function uniqueSortedSourceRefs(
  reports: readonly NormalizedSpotReport[],
): NormalizedSpotReport["sourceRefs"] {
  const unique = new Map<string, NormalizedSpotReport["sourceRefs"][number]>();
  for (const report of reports) {
    for (const ref of report.sourceRefs) {
      const stamp = sourceRefStamp(ref);
      const existing = unique.get(stamp);
      if (!existing || (ref.sourceReportId ?? "") < (existing.sourceReportId ?? "")) {
        unique.set(stamp, ref);
      }
    }
  }
  return [...unique.values()].sort(compareSourceRefs);
}

/**
 * Keep primary identity and at least one ref per contributing feed, then fill
 * remaining slots in deterministic precedence/id order up to SOURCE_REF_LIMIT.
 */
export function mergeSourceRefs(
  reports: readonly NormalizedSpotReport[],
  primary: NormalizedSpotReport,
): NormalizedSpotReport["sourceRefs"] {
  const ordered = uniqueSortedSourceRefs(reports);
  const primaryRef = ordered.find((ref) =>
    ref.source === primary.source && ref.sourceReportId === primary.sourceReportId,
  ) ?? { source: primary.source, sourceReportId: primary.sourceReportId };
  const keep = new Set<string>();
  const consider = (ref: NormalizedSpotReport["sourceRefs"][number]) => {
    if (keep.size >= SOURCE_REF_LIMIT) return;
    keep.add(sourceRefStamp(ref));
  };
  consider(primaryRef);
  for (const source of SOURCE_PRECEDENCE) {
    const first = ordered.find((ref) => ref.source === source);
    if (first) consider(first);
  }
  for (const ref of ordered) consider(ref);
  return ordered.filter((ref) => keep.has(sourceRefStamp(ref)));
}

function preferredFromGroup(reports: readonly NormalizedSpotReport[]): NormalizedSpotReport {
  return reports.reduce((best, report) => preferReport(best, report));
}

function snrFromGroup(reports: readonly NormalizedSpotReport[]): number | null {
  const values = reports
    .map((report) => report.snrDb)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((best, value) => (value > best ? value : best));
}

/** Choose once from the complete immutable duplicate set. Order of `reports` does not matter. */
export function mergeDuplicateGroup(
  reports: readonly NormalizedSpotReport[],
): NormalizedSpotReport {
  const preferred = preferredFromGroup(reports);
  return {
    ...preferred,
    sourceRefs: mergeSourceRefs(reports, preferred),
    snrDb: snrFromGroup(reports),
  };
}

export function mergeDuplicateReports(
  first: NormalizedSpotReport,
  second: NormalizedSpotReport,
  ...rest: NormalizedSpotReport[]
): NormalizedSpotReport {
  return mergeDuplicateGroup([first, second, ...rest]);
}
