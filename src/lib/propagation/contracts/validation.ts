/**
 * PROP-04 fail-closed validation primitives (#950).
 *
 * Every parser in this directory returns a typed outcome. It never throws on
 * data, never returns a partially filled object, and never repairs an invalid
 * value: a rejection lists the path and the reason. Unknown object keys and
 * unknown enum members are rejections, not ignored extras.
 */
import { z } from "zod";

/** One rejection: where it happened and why. */
export interface ContractIssue {
  /** Dotted path into the candidate value, "" for the root. */
  path: string;
  /** Human-readable reason, stable enough to assert on in a test. */
  reason: string;
}

/** Result of a parse. `value` exists only when `ok` is true. */
export type ParseOutcome<T> =
  { ok: true; value: T } | { ok: false; issues: ContractIssue[] };

/**
 * Require a string to arrive already trimmed, reporting rather than repairing.
 *
 * These strings define cache identity and artefact identity, so a silent
 * `.trim()` would let `"ctx-v1 "` and `"ctx-v1"` become one key after the fact,
 * hiding a producer bug instead of naming it.
 */
export function trimmed(schema: z.ZodString) {
  return schema.refine((value) => value === value.trim(), {
    message: "This value carries no leading or trailing whitespace",
  });
}

/** Non-empty identifier, already trimmed on the wire. */
export const identifier = trimmed(z.string().min(1));

/**
 * A pinned artefact digest, shared by the capability declaration and the
 * result provenance so the two cannot drift. M19/M24 traceability needs the
 * artefact itself, not a human-readable label, so the shape is checked:
 * `sha256:` and 64 lowercase hexadecimal digits, with no whitespace repaired.
 */
export const artifactHash = trimmed(
  z
    .string()
    .regex(
      /^sha256:[0-9a-f]{64}$/,
      "An artefact hash is sha256: followed by 64 lowercase hex digits",
    ),
);

/**
 * The wire form of an M01 request key: the bare SHA-256 of the canonical
 * serialization `requestKeyDigest` produces, 64 lowercase hexadecimal digits
 * and no prefix. A result names the request it answers by that digest, so a
 * free-text label could never be compared against a recomputed key.
 */
export const requestKeyDigestText = trimmed(
  z
    .string()
    .regex(
      /^[0-9a-f]{64}$/,
      "A request key is the 64 lowercase hex digits of its SHA-256 digest (M01)",
    ),
);

/**
 * The `schemaVersion` literal a wire shape is tagged with.
 *
 * A version bump is a shape change, so a payload tagged with another version
 * is a different shape and is refused rather than reshaped. The message names
 * both versions, because "invalid literal" on a root field reads like a typo
 * and this is the one rejection a caller fixes by upgrading rather than by
 * correcting a value.
 */
export function schemaVersionLiteral<Version extends string>(version: Version) {
  return z.literal(version, {
    errorMap: (issue) => {
      const received =
        issue.code === "invalid_literal" && typeof issue.received === "string"
          ? issue.received
          : "no version";
      return {
        message: `This contract is ${version} and the payload is tagged ${received}; a schema version bump is a shape change, so the older payload is refused rather than reshaped (M19)`,
      };
    },
  });
}

/** More than three fractional-second digits. */
const SUB_MILLISECOND = /\.\d{4,}/;

/**
 * ISO 8601 instant with an explicit offset (protocol `replay` uses UTC), at
 * most millisecond precision.
 *
 * Every timestamp comparison and the canonical request key run through
 * `Date.parse`, which truncates to whole milliseconds, so a fourth fractional
 * digit would make two distinct wire values one cache entry. Restricting the
 * wire schema is the lossless choice and costs nothing here: every producer in
 * this repository is a JavaScript `Date`, which emits exactly three digits.
 */
export const instant = z
  .string()
  .datetime({ offset: true })
  .refine((value) => !SUB_MILLISECOND.test(value), {
    message:
      "An instant carries at most millisecond precision (three fractional digits)",
  })
  /**
   * ISO 8601 permits offsets such as +24:00 that `Date.parse` cannot
   * represent. An unparseable instant would silently become NaN and defeat
   * every ordering comparison, so it is rejected at the boundary instead.
   */
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: "An instant must name a real offset that parses to an instant",
  });

/** A finite number. NaN, Infinity and -Infinity are all rejected. */
export const finite = z.number().finite();

/** A probability in [0, 1]; NaN and out-of-range values are rejected. */
export const probability = finite.min(0).max(1);

/**
 * The single legal non-finite value in these contracts: the no-power sentinel
 * for a mode that carries no power at all (M07). JSON cannot encode it, so the
 * string `"-Infinity"` is accepted on the wire and normalized to the number.
 * `+Infinity` and `NaN` are never accepted anywhere.
 */
export const NO_POWER_DB = Number.NEGATIVE_INFINITY;

/** A power/level in dB that may be the no-power sentinel. */
export const decibelsOrNoPower = z
  .union([z.number(), z.literal("-Infinity")])
  .transform((value, ctx): number => {
    if (value === "-Infinity") return NO_POWER_DB;
    if (Number.isFinite(value) || value === NO_POWER_DB) return value;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Must be a finite number or the no-power sentinel -Infinity (JSON: "-Infinity")',
    });
    return z.NEVER;
  });

/**
 * A value that is either known or explicitly unknown. Missing information
 * never coerces to zero (M11); an unknown always carries its reason.
 */
export function knownOrUnknown<T extends z.ZodTypeAny>(value: T) {
  return z.discriminatedUnion("state", [
    z.object({ state: z.literal("unknown"), reason: identifier }).strict(),
    z.object({ state: z.literal("known"), value }).strict(),
  ]);
}

export type Known<T> =
  { state: "unknown"; reason: string } | { state: "known"; value: T };

/** Milliseconds since epoch for an already-validated instant string. */
export function instantMs(value: string): number {
  return Date.parse(value);
}

function formatPath(path: readonly (string | number)[]): string {
  return path
    .map((segment) =>
      typeof segment === "number" ? `[${segment}]` : String(segment),
    )
    .join(".")
    .replace(/\.\[/g, "[");
}

/** Convert a zod failure into contract issues, sorted for stable assertions. */
export function toIssues(error: z.ZodError): ContractIssue[] {
  return error.issues
    .map((issue) => ({
      path: formatPath(issue.path),
      reason: issue.message,
    }))
    .sort(
      (a, b) =>
        a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason),
    );
}

/** Recursively freeze a parsed contract value so a context cannot be mutated. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entry);
  }
  return Object.freeze(value);
}

/**
 * Run a schema against unknown input and return a frozen value or issues.
 * A thrown error inside a refinement becomes an issue; nothing escapes.
 */
export function parseWith<S extends z.ZodTypeAny>(
  schema: S,
  candidate: unknown,
): ParseOutcome<z.output<S>> {
  let outcome: z.SafeParseReturnType<unknown, z.output<S>>;
  try {
    outcome = schema.safeParse(candidate);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          path: "",
          reason: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  if (!outcome.success) return { ok: false, issues: toIssues(outcome.error) };
  return { ok: true, value: deepFreeze(outcome.data) };
}

/** Add a custom issue at a path inside a refinement. */
export function reject(
  ctx: z.RefinementCtx,
  path: (string | number)[],
  message: string,
): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

/**
 * The one canonical spelling of a coordinate, shared by the geometry checks in
 * `request.ts` and the key projection in `requestKey.ts` so the two cannot
 * drift. Three spellings collapse: -0 is 0, longitude 180 is written -180, and
 * at either pole every meridian names the same point, so longitude folds to 0.
 */
export function canonicalCoordinates(coordinates: {
  latitudeDeg: number;
  longitudeDeg: number;
}): { latitudeDeg: number; longitudeDeg: number } {
  const latitudeDeg =
    coordinates.latitudeDeg === 0 ? 0 : coordinates.latitudeDeg;
  if (latitudeDeg === 90 || latitudeDeg === -90) {
    return { latitudeDeg, longitudeDeg: 0 };
  }
  const folded =
    coordinates.longitudeDeg === 180 ? -180 : coordinates.longitudeDeg;
  return { latitudeDeg, longitudeDeg: folded === 0 ? 0 : folded };
}
