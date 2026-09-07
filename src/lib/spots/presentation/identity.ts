import { stripCallsignModifiers } from "@/lib/api/callsignIngestion";
import {
  spotSourceSchema,
  type NormalizedSpotReport,
} from "@/lib/views/spotContracts";
import type { z } from "zod";
import { locationPrecisionRank } from "./location";

type SpotSource = z.infer<typeof spotSourceSchema>;

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

function fnv1a64Hex(input: string): string {
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
  observedAtMs: number;
  frequencyKhz: number;
  mode: string;
  source: SpotSource;
  sourceReportId: string | null;
}

/**
 * Known receivers identify an observation across feeds by DX, reporter, exact
 * time, frequency and canonical mode. Unknown/posting-service reporters stay
 * namespaced by source unless a shared upstream id proves a copy.
 */
export function observationKey(input: ObservationKeyInput): string {
  const dx = canonicalCallsign(input.dx) || input.dx.trim().toUpperCase();
  const reporter = input.reporter ? canonicalCallsign(input.reporter) : "";
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
  const hash = fnv1a64Hex(key);
  let candidate = `r${hash}`;
  let n = 2;
  while (used.has(candidate) && used.get(candidate) !== key) {
    candidate = `r${hash}-${n}`;
    n += 1;
  }
  used.set(candidate, key);
  return candidate;
}

export function preferReport(
  current: NormalizedSpotReport,
  incoming: NormalizedSpotReport,
): NormalizedSpotReport {
  const currentRank = locationPrecisionRank(current.dx.location);
  const incomingRank = locationPrecisionRank(incoming.dx.location);
  if (incomingRank > currentRank) return incoming;
  if (incomingRank < currentRank) return current;
  if (sourcePrecedenceRank(incoming.source) < sourcePrecedenceRank(current.source)) {
    return incoming;
  }
  if (sourcePrecedenceRank(incoming.source) > sourcePrecedenceRank(current.source)) {
    return current;
  }
  return incoming.id < current.id ? incoming : current;
}

export function mergeSourceRefs(
  primary: NormalizedSpotReport,
  other: NormalizedSpotReport,
): NormalizedSpotReport["sourceRefs"] {
  const refs = [...primary.sourceRefs];
  const seen = new Set(refs.map((ref) => `${ref.source}:${ref.sourceReportId ?? ""}`));
  for (const ref of other.sourceRefs) {
    const stamp = `${ref.source}:${ref.sourceReportId ?? ""}`;
    if (seen.has(stamp)) continue;
    if (refs.length >= 32) break;
    seen.add(stamp);
    refs.push(ref);
  }
  return refs;
}

export function mergeDuplicateReports(
  primary: NormalizedSpotReport,
  duplicate: NormalizedSpotReport,
): NormalizedSpotReport {
  const preferred = preferReport(primary, duplicate);
  const other = preferred === primary ? duplicate : primary;
  return {
    ...preferred,
    sourceRefs: mergeSourceRefs(preferred, other),
    snrDb: preferred.snrDb ?? other.snrDb,
  };
}
