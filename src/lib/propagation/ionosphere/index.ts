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
 * Within-month foF2 decile variability ("P1239-3 Decile Factors") is shipped
 * as its own asset and accessor by `decileFactors.ts` (#1102). It stops at the
 * two factors: the circuit MUF deciles the reference forms from them in
 * `MUFVariability` are #954.
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
  DECILE_ASSET_SHA256,
  DECILE_ASSET_URL,
  loadDecileFactorAsset,
  resetDecileFactorAssetCache,
  type DecileByteSource,
  type DecileFactorTable,
} from "./assets/decileLoader";

export {
  foF2DecileFactorsFrom,
  foF2Season,
  r12Range,
  resolveFoF2DecileFactors,
  FOF2_SEASONS,
  LATITUDE_STEP_DEG,
  R12_RANGES,
  type DecileFactorQuery,
  type FoF2DecileFactors,
  type FoF2Season,
  type R12Range,
} from "./decileFactors";

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
export {
  longitudinalGyrofrequencyMHz,
  magneticField,
  modifiedDipLatitudeRad,
  D_REGION_FIELD_HEIGHT_KM,
  MAP_DIP_HEIGHT_KM,
} from "./modip";
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
