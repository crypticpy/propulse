/**
 * Shared ionospheric climatology provider (PROP-07, #953).
 *
 * The adopted model is ITU-R P.533-14's monthly median climatology over the
 * CCIR numerical map of ITU-R P.1239 Annex 1. See `provider.ts` for what it
 * deliberately does not model, and `assets/manifest.json` for the provenance
 * and the measured parity residuals against the ITU's own data files.
 *
 * Where the validation lives: `provider.state()` is the leaf's boundary. It
 * validates every field of `IonosphereQuery` - coordinates (finite, in domain,
 * then canonicalised), `validAt` (a real calendar instant with an offset),
 * `r12` (a well-formed `Known<number>`, finite and non-negative, or a reason
 * string) and `mode` - and rejects with `IonosphereQueryError`, a `RangeError`.
 * The model primitives exported below (`evaluateMap`, `geographicFunctions`,
 * `solarParameters`, `foE`, `magneticField`, ...) are the internals of that
 * model: they are pure, they assume inputs the boundary has already checked,
 * and they deliberately do not re-validate.
 *
 * Within-month foF2 decile variability ("P1239-3 Decile Factors") is deferred
 * to #1102: the reference consumes it in `MUFVariability`, which is a circuit
 * concern rather than a point climatology.
 */

export {
  createCcirIonosphereProvider,
  getIonosphereProvider,
  ionosphereStateDigest,
  yearPhase,
  registerIonosphereProvider,
  clearIonosphereProviders,
  CAPABILITIES,
  DETERMINISM_PROBE_DIGEST,
  DETERMINISM_PROBE_QUERY,
  PROVIDER_ID,
  PROVIDER_VERSION,
  type IonosphereProvider,
} from "./provider";

export {
  ASSET_SHA256,
  ASSET_URL,
  loadNumericalMapAsset,
  resetNumericalMapAssetCache,
  type AssetByteSource,
  type NumericalMapAsset,
} from "./assets/loader";

export {
  canonicalCoordinates,
  deepFreeze,
  IonosphereQueryError,
  requireCanonicalCoordinates,
  foF2FromNmF2,
  IonosphereAssetError,
  isArtifactHash,
  known,
  nmF2FromFoF2,
  parseInstant,
  unknown,
  type ArtifactHash,
  type CanonicalCoordinates,
  type CapabilityState,
  type Instant,
  type IonosphereQuantity,
  type IonosphereQuery,
  type IonosphereState,
  type IonosphereTimeMode,
  type Known,
  type SolarGeometryState,
  type SolarIndexState,
} from "./types";

export { foE, phi12FromR12, type FoEResult } from "./foE";
export { magneticField, modifiedDipLatitudeRad } from "./modip";
export {
  blendBySolarIndex,
  evaluateMap,
  geographicFunctions,
  gridNeighbourhood,
  gridNodeCoordinatesRad,
  referenceMapHour,
  timeTerms,
  GRID_INCREMENT_DEG,
  GRID_LATITUDES,
  GRID_LONGITUDES,
  MAX_R12,
} from "./numericalMap";
export { solarParameters, MODEL_YEAR_DAYS, MONTH_PHASE_DAY } from "./solar";
