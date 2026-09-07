export {
  APEX_DISPLAY_HEIGHT_BOOST,
  D_LAYER_DISPLAY_HEIGHT_KM,
  apexDisplayHeightKm,
  computeGroundPoints,
  decorativeShellPlacement,
  type DecorativeShellPlacement,
  type GroundPoint,
  type VisualShell,
} from "./geometry";
export {
  PATH_POINT_ID_MAX_LENGTH,
  pathPointId,
  type PathPointRole,
} from "./identity";
export {
  PATH_POINT_HIT_MIN_OPACITY,
  pathPointAcceptsPointer,
  pathPointsRemainInspectable,
} from "./hitEligibility";
export {
  BUILTIN_RAY_TRACE_MODEL_NAME,
  BUILTIN_RAY_TRACE_MODEL_VERSION,
  DEFAULT_PATH_POINT_STALE_AFTER_MS,
  builtinRayTraceProvenance,
  buildPathPointSet,
  pathPointHoverText,
  pathPointListLabel,
  type BuildPathPointInput,
  type PathPointBuildStatus,
  type PathPointSet,
} from "./descriptors";
