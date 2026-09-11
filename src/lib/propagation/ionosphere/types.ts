/**
 * Contract types for the shared ionospheric climatology provider (PROP-07, #953).
 *
 * These are declared locally on purpose. PROP-04 (#950, PR #1099) introduces the
 * canonical `src/lib/propagation/contracts` module with the same shapes, but it
 * is unmerged, and a leaf may not import from an unmerged branch. Every type
 * below is structurally compatible with its #1099 counterpart, so the swap is a
 * change of import path and nothing else.
 */

// swap to @/lib/propagation/contracts after #1099
/** `sha256:` followed by exactly 64 lowercase hex digits. */
export type ArtifactHash = string;

export const ARTIFACT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function isArtifactHash(value: string): value is ArtifactHash {
  return ARTIFACT_HASH_PATTERN.test(value);
}

// swap to @/lib/propagation/contracts after #1099
/**
 * An ISO-8601 instant with at most three fractional-second digits and an
 * explicit offset. A bare local timestamp is not an instant and is rejected:
 * every quantity here is a function of UTC, so an ambiguous input would produce
 * a confidently wrong answer.
 */
export type Instant = string;

const INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export function parseInstant(value: string): Date | null {
  if (!INSTANT_PATTERN.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// swap to @/lib/propagation/contracts after #1099
export interface CanonicalCoordinates {
  /** Degrees north, -90 to 90 inclusive. */
  readonly latitude: number;
  /** Degrees east, -180 inclusive to 180 exclusive. */
  readonly longitude: number;
}

/**
 * Canonicalise a geographic position so that two spellings of the same place
 * produce the same cache key: negative zero collapses to zero, longitude 180
 * folds to -180, and at either pole longitude is meaningless and folds to 0.
 */
export function canonicalCoordinates(
  latitude: number,
  longitude: number,
): CanonicalCoordinates {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new RangeError(
      `coordinates must be finite, received (${latitude}, ${longitude})`,
    );
  }
  if (latitude < -90 || latitude > 90) {
    throw new RangeError(`latitude ${latitude} is outside -90..90`);
  }
  let lon = ((((longitude + 180) % 360) + 360) % 360) - 180;
  const lat = latitude === 0 ? 0 : latitude;
  if (lat === 90 || lat === -90) lon = 0;
  if (lon === 0) lon = 0;
  return Object.freeze({ latitude: lat, longitude: lon });
}

// swap to @/lib/propagation/contracts after #1099
export type Known<T> =
  | { readonly known: true; readonly value: T }
  | { readonly known: false; readonly reason: string };

export function known<T>(value: T): Known<T> {
  return { known: true, value };
}

export function unknown<T>(reason: string): Known<T> {
  return { known: false, reason };
}

// swap to @/lib/propagation/contracts after #1099
export type CapabilityState =
  | { readonly status: "supported"; readonly note?: string }
  | { readonly status: "unsupported"; readonly reason: string };

/**
 * Every ionospheric quantity a consumer might ask this provider for, including
 * the ones it deliberately does not model. Listing the unsupported ones is the
 * point: a caller that needs `hmF2` learns that from the capability map instead
 * of discovering an undefined at run time.
 */
export type IonosphereQuantity =
  | "foF2"
  | "m3000F2"
  | "foE"
  | "nmF2"
  | "mirrorReflectionHeight"
  | "foF1"
  | "hmF2"
  | "foEs"
  | "dRegionElectronDensity"
  | "collisionFrequency";

/**
 * `reference` reproduces ITU-R P.533-14 exactly: integer month, integer UTC
 * hour, bilinear interpolation of the 1.5-degree grid, linear blend in R12.
 * It is discontinuous at month and hour boundaries, because P.533 is.
 *
 * `enhanced` evaluates the same numerical map continuously in UTC and
 * interpolates between monthly anchors, so it is C0 everywhere. It agrees with
 * `reference` at every anchor to within the grid-versus-map residual.
 */
export type IonosphereTimeMode = "reference" | "enhanced";

export interface IonosphereQuery {
  readonly coordinates: CanonicalCoordinates;
  /** UTC instant of interest. */
  readonly validAt: Instant;
  /**
   * The 12-month smoothed sunspot number. When unknown, the provider falls back
   * to its bundled SILSO climatology and says so in `solarIndex.source`.
   */
  readonly r12: Known<number>;
  readonly mode: IonosphereTimeMode;
}

export interface SolarIndexState {
  /** The R12 actually used, after clipping. */
  readonly r12: number;
  /** The R12 as supplied or as read from climatology, before clipping. */
  readonly requestedR12: number;
  /** True when `requestedR12` exceeded the model's 160 ceiling. */
  readonly clipped: boolean;
  readonly source: "caller" | "bundled-climatology";
}

export interface SolarGeometryState {
  readonly zenithAngleDeg: number;
  readonly declinationDeg: number;
  readonly hourAngleDeg: number;
  readonly equationOfTimeMinutes: number;
  readonly sunriseUtcHours: number;
  readonly sunsetUtcHours: number;
  readonly solarNoonUtcHours: number;
}

export interface IonosphereState {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly artifactHash: ArtifactHash;
  readonly mode: IonosphereTimeMode;
  readonly coordinates: CanonicalCoordinates;
  readonly validAt: Instant;

  /** F2-layer critical frequency, MHz. */
  readonly foF2MHz: number;
  /** F2 propagation factor M(3000)F2, dimensionless. */
  readonly m3000F2: number;
  /** E-layer critical frequency, MHz. */
  readonly foEMHz: number;
  /** F2 peak electron density, electrons per cubic metre. */
  readonly nmF2PerM3: number;

  readonly solarIndex: SolarIndexState;
  readonly solar: SolarGeometryState;
  /** Magnetic dip at 300 km, degrees, from the model's own field expansion. */
  readonly magneticDip300kmDeg: number;
  /** Electron gyrofrequency at 300 km, MHz. */
  readonly gyrofrequency300kmMHz: number;

  /**
   * Every in-model derivation, substitution and clip applied to reach this
   * state, in the order applied. Never empty: the adopted model is always
   * named.
   */
  readonly assumptions: readonly string[];
}

/**
 * The coefficient asset is missing, truncated, or does not match the digest the
 * manifest pins. There is no fallback path: a hand-shaped curve that silently
 * replaced a standards-based map would be indistinguishable from a correct
 * answer at the call site, which is exactly the failure this leaf exists to end.
 */
export class IonosphereAssetError extends Error {
  override readonly name = "IonosphereAssetError";

  constructor(
    readonly artifact: string,
    readonly detail: string,
    readonly expectedHash?: ArtifactHash,
    readonly actualHash?: string,
  ) {
    const digests =
      expectedHash === undefined
        ? ""
        : ` (expected ${expectedHash}, got ${actualHash ?? "nothing"})`;
    super(`ionosphere asset "${artifact}" is unusable: ${detail}${digests}`);
  }
}

/** Recursively freeze a plain object graph so a returned state cannot be edited. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

/** foF2 in MHz from F2 peak electron density, ITU-R P.1239 / plasma relation. */
export const PLASMA_CONSTANT = 8.98e-6;

export function foF2FromNmF2(nmF2PerM3: number): number {
  return PLASMA_CONSTANT * Math.sqrt(nmF2PerM3);
}

export function nmF2FromFoF2(foF2MHz: number): number {
  return (foF2MHz / PLASMA_CONSTANT) ** 2;
}
