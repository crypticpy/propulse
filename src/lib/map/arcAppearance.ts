/**
 * Legibility floor for spot arcs.
 *
 * An arc is a screen-space stroke a pixel or two wide, so it loses contrast far
 * faster than a filled dot of the same alpha. Below roughly a pixel the line is
 * antialiased across the boundary and its already-reduced alpha is divided
 * again, which is how arcs came to be readable only where many of them overlap.
 */
const MIN_ARC_OPACITY = 0.35;

/** Age opacity floor for arcs, vs. the shared spot-dot floor of 0.4. */
const ARC_OLDEST_OPACITY = 0.55;

/**
 * Remap the shared age ramp into the narrower band an arc can carry.
 *
 * Spot dots fade to 0.4, which is fine for a filled mark with area behind it
 * but leaves a thin stroke below the noise floor of a dark basemap. Age still
 * reads as fading, just across a range that stays visible end to end.
 */
function remapArcAgeOpacity(dotOpacity: number): number {
  const t = (dotOpacity - 0.4) / 0.6; // The shared spot-age ramp spans 0.4 → 1.0.
  return (
    ARC_OLDEST_OPACITY + (1 - ARC_OLDEST_OPACITY) * Math.min(1, Math.max(0, t))
  );
}

/**
 * Resolve the final arc opacity without erasing intentional filter emphasis.
 *
 * The legibility floor belongs to the age visualization: old arcs should not
 * disappear merely because they are old. Band/profile filters are a separate
 * semantic channel and must remain free to de-emphasize a nonmatching path
 * below that floor.
 */
export function getArcOpacity(
  dotOpacity: number,
  ageVisualizationEnabled: boolean,
  filterOpacityMultiplier: number,
): number {
  const ageOpacity = ageVisualizationEnabled
    ? remapArcAgeOpacity(dotOpacity)
    : 1.0;
  return Math.max(MIN_ARC_OPACITY, ageOpacity) * filterOpacityMultiplier;
}
