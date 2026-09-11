/**
 * radioEvidence — observed path activity from the durable spot aggregates
 * (#1047, WP1 stage 3).
 *
 * What this family answers: for one band and one Maidenhead field pair, was
 * the path observed open recently, how recently, and how much of the answer
 * rests on coverage rather than on reports. What it never answers: whether
 * the path is closed. No aggregate SNR is read, `spot_history` is never
 * touched, and nothing here reaches the network — rows come in as arguments.
 */

export {
  DEFAULT_OBSERVED_WINDOW_SECONDS,
  resolveCoverage,
} from "@/lib/propagation/radioEvidence/coverage";
export { derivePathActivity } from "@/lib/propagation/radioEvidence/activityRecord";
export {
  OBSERVED_ACTIVITY_COVERAGE_ID,
  OBSERVED_ACTIVITY_READER_ID,
  projectObservedActivityHead,
} from "@/lib/propagation/radioEvidence/observedActivityHead";
export { MODE_CLASSES } from "@/lib/propagation/radioEvidence/types";
export type {
  AgeKind,
  CoverageVerdict,
  FieldAttribution,
  ModeClass,
  ModeClassCounts,
  ObservedActivityEvidenceSource,
  ObservedActivityHead,
  ObservedActivityIdentity,
  ObservedActivityProjection,
  ObservedActivityState,
  PathActivityPairRow,
  PathActivityRecord,
  PathCoverageRow,
  RadioEvidenceInputs,
  ReadableBandHourRow,
  ReadableSpan,
  UnknownReason,
} from "@/lib/propagation/radioEvidence/types";
