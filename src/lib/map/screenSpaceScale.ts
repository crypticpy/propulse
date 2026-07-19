const DEFAULT_REFERENCE_DISTANCE = 1.5;

/**
 * Scale world-space markers by their camera distance so their apparent size
 * remains stable instead of filling the viewport at close globe zooms.
 */
export function getScreenSpaceScale(
  cameraDistance: number,
  referenceDistance: number = DEFAULT_REFERENCE_DISTANCE,
): number {
  const safeReference = Math.max(referenceDistance, Number.EPSILON);
  return Math.max(1e-7, Math.min(1, cameraDistance / safeReference));
}
