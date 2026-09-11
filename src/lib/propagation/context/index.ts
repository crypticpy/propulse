/**
 * PROP-05 as-of context leaf (#951).
 *
 * The public surface: a source ledger (M11), as-of selection (M02), an
 * as-issued forecast trajectory (M14), record adapters for the shapes this
 * repository already produces, and the immutable snapshot that binds them to
 * one `issuedAt` and one digest.
 */
export {
  fluxForecastRecords,
  fluxOutlookRecords,
  kpRecords,
  recordsFromSnapshotRow,
  type CaptureMeta,
  type KpRecords,
  type SolarSnapshotRow,
} from "@/lib/propagation/context/adapters";
export {
  DISABLED_CAPABILITIES,
  getLedgerEntry,
  LEDGER_SOURCE_IDS,
  LEDGER_VERSION,
  SOURCE_AGE_BOUNDS_SECONDS,
  SOURCE_LEDGER,
  UnknownSourceError,
  type DisabledCapability,
  type LedgerSourceId,
  type SourceKind,
  type SourceLedgerEntry,
} from "@/lib/propagation/context/ledger";
export {
  admitRecord,
  ContextDeclarationError,
  ContextStampError,
  ContextVariableError,
  type Admitted,
  type AdmittedForecast,
  type AdmissionOptions,
} from "@/lib/propagation/context/admission";
export {
  eligibleAsOf,
  inactiveBarrierAsOf,
  selectAsOf,
  type SelectOptions,
} from "@/lib/propagation/context/selection";
export {
  buildContextSnapshot,
  CENSUS_SOURCE_IDS,
  toEvidenceSources,
  type ContextSnapshotOptions,
  type EvidenceSourceProjection,
} from "@/lib/propagation/context/snapshot";
// `buildTrajectory` is deliberately not exported. It reads a `Selected`
// outcome and a mode it cannot re-derive, so an outcome produced for another
// issue instant or another mode would reach horizon zero unchecked.
// `buildContextSnapshot` is the only public entry and the census is the only
// producer of those inputs; the leaf's own tests import it directly.
export {
  ContextForecastError,
  DEFAULT_GRID_HOURS,
  GRID_STEP_SECONDS,
  type Trajectory,
} from "@/lib/propagation/context/trajectory";
export {
  ageSecondsAt,
  CONTEXT_SCHEMA_VERSION,
  ContextTimeError,
  instantMs,
  type ArchiveClass,
  type BucketWindow,
  type ContextSnapshot,
  type DatedRecord,
  type DriverValue,
  type ExclusionReason,
  type Instant,
  type PublicationClass,
  type PublishedOutcome,
  type RecordOrigin,
  type Selected,
  type SnapshotEntry,
  type SourceActivity,
  type SourceHistory,
  type SourceMode,
  type SourceRecord,
  type SourceStamps,
  type TrajectorySample,
} from "@/lib/propagation/context/types";
