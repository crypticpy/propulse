/**
 * Far-side / occluded points must not receive pointer hits.
 * Matches globe interaction visibility used by endpoint hit meshes.
 */
export const PATH_POINT_HIT_MIN_OPACITY = 0.05;

export function pathPointAcceptsPointer(occlusionOpacity: number): boolean {
  return occlusionOpacity >= PATH_POINT_HIT_MIN_OPACITY;
}

/** MOTION-05: reduced motion stops travel; inspectable targets stay selectable. */
export function pathPointsRemainInspectable(_motion: {
  osReducedMotion: boolean;
  reduceMotion: boolean;
  travelProgress: number | null;
}): boolean {
  return true;
}
