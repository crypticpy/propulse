/**
 * ITU-R P.533-14 circuit physics (PROP-08, #954).
 *
 * Slice A: the Table 1 control points, the basic MUF of sections 3.3 and 3.5,
 * and the operational MUF of section 3.7. Slice B: the E-layer maximum
 * screening frequency of section 4 and the mode set of section 5.2.1. Later
 * slices add short-path field strength, the long-path method and the solver
 * that ties them together.
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
