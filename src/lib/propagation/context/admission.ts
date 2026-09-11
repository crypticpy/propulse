/**
 * PROP-05 admission gate (#951).
 *
 * Every record entering this leaf is checked here, against the ledger entry
 * that declares what records of that source may look like (M11). Nothing
 * downstream re-derives any of it: selection, the trajectory and the snapshot
 * all call this first, so no consumer branch can ever see a record whose
 * self-description was taken on trust.
 *
 * The line this file draws: a violation of a declaration is a caller or
 * producer bug and throws, because the honest answer to "a kp record claims a
 * verified as-issued archive" is not a quieter number. Whether an admitted
 * record was usable at some instant is a different question with a different
 * answer shape, and lives in `selection.ts` as an exclusion reason.
 */
import type {
  SourceKind,
  SourceLedgerEntry,
} from "@/lib/propagation/context/ledger";
import { instantMs, type SourceRecord } from "@/lib/propagation/context/types";

/**
 * A record whose stamps describe a history that could not have happened.
 *
 * Observed, then published, then captured is the causal order a real product
 * goes through. A capture that precedes its own publication, or a publication
 * that precedes the end of the interval it reports, is a producer bug, not an
 * eligibility outcome: answering from it would reconstruct a provenance that
 * never existed (M02, M24).
 */
export class ContextStampError extends Error {
  override readonly name = "ContextStampError";

  constructor(
    readonly sourceId: string,
    readonly detail: string,
  ) {
    super(
      `record from "${sourceId}" describes an impossible history: ${detail}`,
    );
  }
}

/** A record carrying a variable its ledger entry never declared (M11). */
export class ContextVariableError extends Error {
  override readonly name = "ContextVariableError";

  constructor(
    readonly sourceId: string,
    readonly variable: string,
  ) {
    super(
      `source "${sourceId}" does not declare the variable "${variable}"; an undeclared variable cannot be selected (M11)`,
    );
  }
}

/**
 * A record contradicting something its own ledger entry declares: its kind,
 * the best archive it can carry, the publication class that goes with that
 * archive, or the horizon it is valid over.
 */
export class ContextDeclarationError extends Error {
  override readonly name = "ContextDeclarationError";

  constructor(
    readonly sourceId: string,
    readonly rule: string,
    readonly detail: string,
  ) {
    super(
      `record from "${sourceId}" contradicts its ledger declaration (${rule}): ${detail}`,
    );
  }
}

/** What the gate parsed while checking, so no caller re-parses the same stamps. */
export interface Admitted {
  readonly observedMs: number;
  readonly publishedMs: number;
  readonly capturedMs: number;
  /** Both ends or neither, the pair already checked to be well ordered. */
  readonly validity: {
    readonly fromMs: number;
    readonly toMs: number;
  } | null;
  readonly forecastIssuedMs: number | null;
}

/**
 * A forecast has been checked to carry an issue time and a validity interval,
 * so the branch that places it on a grid reads them without a second test.
 */
export interface AdmittedForecast extends Admitted {
  readonly validity: { readonly fromMs: number; readonly toMs: number };
  readonly forecastIssuedMs: number;
}

export interface AdmissionOptions {
  /**
   * The product kind the consuming branch reads. Defaults to the kind the
   * entry itself declares, which is the right answer for the census; a branch
   * that only accepts forecasts, or only bundled priors, names it instead.
   */
  readonly role?: SourceKind;
}

/**
 * Validate one record against its ledger entry, returning the instants the
 * check already had to parse.
 */
export function admitRecord(
  entry: SourceLedgerEntry,
  record: SourceRecord,
  options: AdmissionOptions & { readonly role: "forecast" },
): AdmittedForecast;
export function admitRecord(
  entry: SourceLedgerEntry,
  record: SourceRecord,
  options?: AdmissionOptions,
): Admitted;
export function admitRecord(
  entry: SourceLedgerEntry,
  record: SourceRecord,
  options: AdmissionOptions = {},
): Admitted {
  if (
    record.sourceId !== entry.sourceId ||
    !entry.variables.includes(record.variable)
  ) {
    throw new ContextVariableError(record.sourceId, record.variable);
  }

  const observed = instantMs(
    record.stamps.observedIntervalEndAt,
    "observedIntervalEndAt",
  );
  const published = instantMs(
    record.stamps.publication.publishedAt,
    "publishedAt",
  );
  const captured = instantMs(record.stamps.capturedAt, "capturedAt");
  if (published < observed) {
    throw new ContextStampError(
      record.sourceId,
      "published before the interval it reports had closed",
    );
  }
  if (captured < published) {
    throw new ContextStampError(
      record.sourceId,
      "captured before it was published",
    );
  }
  const start = record.stamps.observedIntervalStartAt;
  if (
    start !== null &&
    instantMs(start, "observedIntervalStartAt") > observed
  ) {
    throw new ContextStampError(
      record.sourceId,
      "observation interval ends before it starts",
    );
  }

  const role = options.role ?? entry.kind;
  if (entry.kind !== role) {
    throw new ContextDeclarationError(
      record.sourceId,
      "kind",
      `the ledger calls it a ${entry.kind} product, but it was read as a ${role}`,
    );
  }

  // M02: unknown publication history cannot masquerade as a verified
  // as-issued archive. The ledger says what each source can ever prove, and a
  // record may claim that or less, never more.
  if (
    record.stamps.archiveClass === "verified_as_issued" &&
    entry.archiveClass !== "verified_as_issued"
  ) {
    throw new ContextDeclarationError(
      record.sourceId,
      "archive ceiling",
      "claims a verified as-issued archive, but the source prints no publication time and can only be bounded by its capture",
    );
  }
  const expectedPublication =
    record.stamps.archiveClass === "verified_as_issued"
      ? "declared"
      : "bounded_by_capture";
  if (record.stamps.publication.kind !== expectedPublication) {
    throw new ContextDeclarationError(
      record.sourceId,
      "publication class",
      `a ${record.stamps.archiveClass} record carries a ${expectedPublication} publication, not ${record.stamps.publication.kind}`,
    );
  }

  const { validFrom, validTo } = record.stamps;
  if ((validFrom === null) !== (validTo === null)) {
    throw new ContextStampError(
      record.sourceId,
      "states one end of a validity interval and not the other",
    );
  }
  let validity: Admitted["validity"] = null;
  if (validFrom !== null && validTo !== null) {
    const fromMs = instantMs(validFrom, "validFrom");
    const toMs = instantMs(validTo, "validTo");
    if (toMs <= fromMs) {
      throw new ContextStampError(
        record.sourceId,
        "valid interval ends before it opens",
      );
    }
    validity = { fromMs, toMs };
  }
  const admitted: Admitted = {
    observedMs: observed,
    publishedMs: published,
    capturedMs: captured,
    validity,
    forecastIssuedMs:
      record.stamps.forecastIssuedAt === null
        ? null
        : instantMs(record.stamps.forecastIssuedAt, "forecastIssuedAt"),
  };

  if (entry.kind !== "forecast") return admitted;

  if (admitted.forecastIssuedMs === null) {
    throw new ContextDeclarationError(
      record.sourceId,
      "forecast issue time",
      "a forecast product must say when it was issued, or nothing can decide whether a prediction could have used it",
    );
  }
  if (validity === null) {
    throw new ContextDeclarationError(
      record.sourceId,
      "forecast validity",
      "a forecast must say what interval it describes",
    );
  }
  // M11 declares how far ahead each product is valid. A bin beyond that is not
  // a longer forecast, it is a forecast the source never claimed to make.
  const horizon = entry.validHorizonSeconds;
  if (horizon !== null) {
    const ahead = (validity.fromMs - admitted.forecastIssuedMs) / 1000;
    if (ahead >= horizon) {
      throw new ContextDeclarationError(
        record.sourceId,
        "valid horizon",
        `opens ${Math.round(ahead)} s after it was issued, beyond the ${horizon} s this source declares`,
      );
    }
  }

  return admitted;
}
