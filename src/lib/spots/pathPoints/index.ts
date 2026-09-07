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
export { pathPointId, type PathPointRole } from "./identity";
export {
  PATH_POINT_HIT_MIN_OPACITY,
  pathPointAcceptsPointer,
  pathPointsRemainInspectable,
} from "./hitEligibility";
export {
  DEFAULT_PATH_POINT_STALE_AFTER_MS,
  buildPathPointSet,
  pathPointHoverText,
  pathPointListLabel,
  type BuildPathPointInput,
  type PathPointBuildStatus,
  type PathPointSet,
} from "./descriptors";
