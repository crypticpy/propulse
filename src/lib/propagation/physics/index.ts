/**
 * ITU-R P.533-14 circuit physics (PROP-08, #954).
 *
 * Slice A: the Table 1 control points, the basic MUF of sections 3.3 and 3.5,
 * and the operational MUF of section 3.7. Slice B: the E-layer maximum
 * screening frequency of section 4 and the mode set of section 5.2.1. Slice C:
 * the terms of the ray path basic transmission loss of section 5.2.2 and the
 * short-path median field strength and available receiver power of sections
 * 5.2.2 and 6. Slice D: the upper and lower reference frequencies and the
 * median field strength of paths longer than 7 000 km (section 5.3) and the
 * interpolation between the two methods (section 5.4). A later slice adds the
 * solver that ties them together.
 *
 * Nothing here is wired to a consumer yet, and nothing here fetches an
 * ionosphere: a circuit passes in one sampling callback that answers for every
 * control point.
 */

export {
  basicMufDmaxKm,
  basicMufFoEMHz,
  higherOrderModeDmaxKm,
  hopGroundDistanceKm,
  maximumHopLengthKm,
  midPointSite,
  screeningFoEMHz,
  selectControlPoints,
  END_CONTROL_POINT_OFFSET_KM,
  E_MODE_MAX_PATH_KM,
  MAX_DMAX_KM,
  MAX_SHORT_PATH_KM,
  MID_POINT_ONLY_PATH_KM,
  type ControlPointLabel,
  type ControlPointLayer,
  type ControlPointPurpose,
  type ControlPointQuery,
  type ControlPointSelection,
  type ControlPointSite,
  type ControlPointTable,
} from "./controlPoints";

export {
  basicMuf,
  cdFactor,
  eBasicMufMHz,
  f2BasicMufMHz,
  lowestOrderHopCount,
  maxHopForMinElevationKm,
  C3000_HOP_KM,
  E_LAYER_MIRROR_HEIGHT_KM,
  MAX_E_MODES,
  MAX_F2_MODES,
  MIN_ELEVATION_DEG,
  type BasicMufInputs,
  type BasicMufMode,
  type BasicMufResult,
  type ControlPointSampler,
  type LayerBasicMuf,
  type MufControlPointState,
  type ResolvedBasicMuf,
  type SampledControlPoint,
  type UnsupportedBasicMuf,
} from "./basicMuf";

export {
  dayOrNightFromSolarZenith,
  dayOrNightFromUtcSunTimes,
  eirpBand,
  operationalMuf,
  p533Season,
  ropFactor,
  EIRP_BAND_BOUNDARY_DBW,
  E_MODE_DECILE_FACTORS,
  SUNRISE_ZENITH_DEG,
  type DayOrNight,
  type DecileFactors,
  type DecileValue,
  type EirpBand,
  type MufSeason,
  type OperationalMufInputs,
  type OperationalMufMode,
  type OperationalMufResult,
} from "./operationalMuf";

export {
  isScreened,
  pathScreeningFoE,
  screeningFrequencyMHz,
  screeningIncidenceAngleRad,
  E_LAYER_SCREENING_FACTOR,
  E_SCREENING_MAX_PATH_KM,
  type EvaluatedScreeningFoE,
  type NotEvaluatedScreeningFoE,
  type PathScreeningFoE,
  type PathScreeningFoEInputs,
} from "./eLayerScreening";

export {
  modeLabel,
  type ModeStatus,
  type ModeUnsupportedReason,
  type PropagationLayer,
  type PropagationMode,
} from "./modeTypes";

export {
  modeSet,
  E_MODE_MAX_HOP_KM,
  type F2MirrorHeightSource,
  type ModeControlPointSampler,
  type ModeControlPointState,
  type ModeSetInputs,
  type ModeSetResult,
  type ResolvedModeSet,
  type UnsupportedModeSet,
} from "./modeSet";

export {
  aboveMufLoss,
  absorptionRayPathFrequencyMHz,
  basicTransmissionLossDb,
  freeSpaceLossDb,
  groundReflectionLossDb,
  E_ABOVE_MUF_CAP_DB,
  E_ABOVE_MUF_COEFFICIENT,
  F2_ABOVE_MUF_CAP_DB,
  F2_ABOVE_MUF_COEFFICIENT,
  FREE_SPACE_CONSTANT_DB,
  OTHER_LOSSES_DB,
  type AboveMufLayer,
  type AboveMufLoss,
  type AboveMufLossInputs,
  type BasicTransmissionLoss,
  type BasicTransmissionLossTerms,
} from "./losses";

export {
  auroralLoss,
  auroralLossAtPoint,
  geomagneticLatitudeDeg,
  lhDistanceRegime,
  lhLatitudeBandIndex,
  lhSeason,
  lhTimeBandIndex,
  midPathLocalTimeHours,
  AURORAL_MIN_GEOMAGNETIC_LATITUDE_DEG,
  AURORAL_RANGE_BOUNDARY_KM,
  GEOMAGNETIC_POLE_LATITUDE_DEG,
  GEOMAGNETIC_POLE_LONGITUDE_DEG,
  TABLE_2_SHA256,
  type AuroralDistanceRegime,
  type AuroralLoss,
  type AuroralLossAtPoint,
  type AuroralLossInputs,
  type AuroralLossPoint,
  type AuroralLossPointInputs,
  type AuroralSeason,
} from "./auroralLoss";

export {
  absorptionLoss,
  modifiedDipDegAt,
  penetrationPoints,
  PENETRATION_HEIGHT_KM,
  PENETRATION_REFLECTION_HEIGHT_KM,
  type AbsorptionLoss,
  type AbsorptionLossInputs,
  type AbsorptionLossResult,
  type PenetrationEnd,
  type PenetrationPoint,
  type PenetrationPointSampler,
  type PenetrationPointState,
  type PenetrationPointsInputs,
  type PenetrationPointsResult,
} from "./absorptionLoss";

export {
  shortPathFieldStrength,
  DEFAULT_TRANSMITTER_POWER_DB_KW,
  FIELD_STRENGTH_CONSTANT_DB,
  ISOTROPIC_GAIN_DBI,
  RECEIVER_POWER_CONSTANT_DB,
  RECEIVER_POWER_MAX_KM,
  type AntennaGain,
  type AntennaGainContext,
  type ModeFieldStrength,
  type ModeFieldStrengthState,
  type ShortPathFieldStrength,
  type ShortPathFieldStrengthInputs,
  type ShortPathPowerRange,
} from "./fieldStrengthShort";

export {
  distanceReductionFactor,
  f2FourThousandMufMHz,
  f2ZeroMufMHz,
  forwardAzimuthDegAt,
  interpolateTable3,
  kFactor,
  localNoonUtcHour,
  longPathBasicMufMHz,
  longPathMuf,
  FD_COEFFICIENTS,
  FL_TABLES_SHA256,
  K_CONSTANT,
  LONG_PATH_MAX_HOP_COUNT,
  LONG_PATH_MAX_HOP_KM,
  LONG_PATH_MIN_ELEVATION_DEG,
  LONG_PATH_MIRROR_HEIGHT_KM,
  MAX_ROUTE_DISTANCE_KM,
  type KFactorCoefficients,
  type LongPathMufControlPoint,
  type LongPathMufHour,
  type LongPathMufInputs,
  type LongPathMufResult,
  type LongPathMufSampler,
  type LongPathMufState,
  type ResolvedLongPathMuf,
  type UnsupportedLongPathMuf,
} from "./longPath/fM";

export {
  applySunsetDecay,
  longPathLuf,
  nightLufMHz,
  rawLufMHz,
  solarHourAngleRad,
  solarZenithCosine,
  subsolarLatitudeDeg,
  winterAnomalyFactor,
  LUF_COEFFICIENT,
  LUF_DECAY_EXPONENT,
  LUF_DECAY_HOURS,
  LUF_DECAY_PER_HOUR,
  LUF_MAX_HOP_KM,
  LUF_PATH_CONSTANT_KM,
  LUF_PENETRATION_HEIGHT_KM,
  LUF_REFLECTION_HEIGHT_KM,
  LUF_SUNSPOT_COEFFICIENT,
  NIGHT_LUF_DISTANCE_KM,
  WINTER_ANOMALY_LATITUDES_DEG,
  type LongPathLufInputs,
  type LongPathLufResult,
  type LufHour,
  type LufPenetrationPoint,
  type ResolvedLongPathLuf,
  type UnsupportedLongPathLuf,
} from "./longPath/fL";

export {
  etlDbuVPerM,
  focusGainUnlimitedDb,
  freeSpaceFieldStrengthDbuVPerM,
  frequencyFactor,
  longPathFieldStrength,
  EIRP_REFERENCE_OFFSET_DB,
  FREE_SPACE_FIELD_CONSTANT_DB,
  LONG_PATH_INCLUDED_MECHANISMS,
  LONG_PATH_MIN_DISTANCE_KM,
  LONG_PATH_ONLY_DISTANCE_KM,
  LY_DB,
  MAX_FOCUS_GAIN_DB,
  type LongPathFieldStrength,
  type LongPathFieldStrengthInputs,
  type LongPathFieldStrengthTerms,
  type LongPathIncludedMechanism,
  type LongPathRange,
  type ResolvedLongPathFieldStrength,
  type UnsupportedLongPathFieldStrength,
} from "./fieldStrengthLong";

export {
  distanceBlend,
  distanceBlendRegime,
  interpolateDb,
  BLEND_DB_PER_DECADE,
  BLEND_MAX_DISTANCE_KM,
  BLEND_MIN_DISTANCE_KM,
  BLEND_SPAN_KM,
  type DistanceBlendInputs,
  type DistanceBlendRegime,
  type DistanceBlendResult,
  type ResolvedDistanceBlend,
  type UnsupportedDistanceBlend,
} from "./distanceBlend";
