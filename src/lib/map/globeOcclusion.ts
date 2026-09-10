/**
 * Shared globe-occlusion math.
 *
 * Geographic positions are authored in globe-local coordinates, while the
 * camera lives in world space. GlobeView wraps the Earth and all surface
 * overlays in a Z-axis tilt group, so comparing those vectors directly gives
 * the wrong answer anywhere near the limb. Rather than rotating every marker
 * normal, each frame rotates the camera direction back into globe-local space
 * once; both the single-marker and batched hooks then use identical math.
 */

/**
 * Fade region width around the geometric limb of the globe.
 * The limb dot product (1/cameraDistance) is computed per frame,
 * and we fade from fully visible to fully hidden across this range.
 * FADE_BEFORE: how far before the limb to start fading (higher = earlier fade)
 * FADE_AFTER: how far past the limb until fully hidden
 */
export const LIMB_FADE_BEFORE = 0.05;
export const LIMB_FADE_AFTER = 0.12;

/**
 * Width of the alpha gate applied on top of `occlusionOpacity` by overlays
 * that also carry a legibility floor (spot label text alpha, spot arcs).
 *
 * Those floors exist so a de-emphasized overlay on the NEAR face never drops
 * below a readable alpha. Applied unconditionally they also keep an overlay
 * that is past the horizon painted at the floor value, which is what rendered
 * as translucent "ghost" spot tags on the back of the globe. Multiplying the
 * floored value by this gate re-couples the floor to the limb: the gate is 1
 * everywhere the overlay is comfortably on the near face and ramps to 0 across
 * the last quarter of the occlusion fade, so the floor cannot resurrect an
 * overlay the limb has already hidden.
 *
 * 0.25 is deliberately the same value as `SpotLabel`'s `FADE_IN_END`, so a
 * label's text alpha and its wrapper CSS opacity reach full strength at the
 * same occlusion value instead of crossing in the middle of the ramp. In dot
 * terms it is roughly the last 0.05 of the ~0.17-wide occlusion band, i.e. a
 * couple of degrees of rotation rather than a hard cut.
 */
export const LIMB_ALPHA_GATE_WINDOW = 0.25;

interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface GlobeOcclusionFrame {
  cameraDistance: number;
  localCameraX: number;
  localCameraY: number;
  localCameraZ: number;
}

/**
 * Convert the world-space camera direction into the coordinate space used by
 * lat/lon marker normals. The globe's parent applies +tilt around Z, so its
 * inverse applies -tilt to the camera direction.
 */
export function createGlobeOcclusionFrame(
  cameraPosition: Vector3Like,
  tiltDegrees: number,
): GlobeOcclusionFrame | null {
  const { x, y, z } = cameraPosition;
  const cameraDistance = Math.sqrt(x * x + y * y + z * z);

  // A zero-length camera position should never occur in practice. Keeping the
  // guard here prevents division by zero in every hook consumer.
  if (cameraDistance === 0) return null;

  const worldX = x / cameraDistance;
  const worldY = y / cameraDistance;
  const worldZ = z / cameraDistance;
  const tiltRadians = (tiltDegrees * Math.PI) / 180;
  const cosTilt = Math.cos(tiltRadians);
  const sinTilt = Math.sin(tiltRadians);

  return {
    cameraDistance,
    localCameraX: worldX * cosTilt + worldY * sinTilt,
    localCameraY: -worldX * sinTilt + worldY * cosTilt,
    localCameraZ: worldZ,
  };
}

/**
 * Attempt to compute a smoothstep interpolation (Hermite).
 * Maps a value from [edge0, edge1] to [0, 1] with smooth easing.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Calculate the opacity for one geographic position using a camera frame that
 * has already been transformed into globe-local space.
 */
export function getGlobeOcclusionOpacity(
  lat: number,
  lon: number,
  frame: GlobeOcclusionFrame,
): number {
  // Convert lat/lon to unit surface normal (direction from globe center).
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const normalX = -Math.sin(phi) * Math.cos(theta);
  const normalY = Math.cos(phi);
  const normalZ = Math.sin(phi) * Math.sin(theta);

  const dot =
    normalX * frame.localCameraX +
    normalY * frame.localCameraY +
    normalZ * frame.localCameraZ;

  // For a unit sphere viewed from distance D, the geometric limb (tangent
  // point) has dot(surfaceNormal, cameraDirection) = 1/D.
  const limbDot = 1 / frame.cameraDistance;
  const visibleThreshold = limbDot + LIMB_FADE_BEFORE;
  const hiddenThreshold = limbDot - LIMB_FADE_AFTER;

  if (dot > visibleThreshold) return 1;
  if (dot < hiddenThreshold) return 0;
  return smoothstep(hiddenThreshold, visibleThreshold, dot);
}

/**
 * Gate a floored overlay alpha by how far the overlay is from the limb.
 *
 * Returns 1 while `occlusionOpacity` is at or above `LIMB_ALPHA_GATE_WINDOW`
 * (so a near-face overlay keeps its full legibility floor) and smoothsteps to
 * 0 as the occlusion term itself reaches 0. Monotonic in `occlusionOpacity`,
 * so multiplying a monotonic alpha by it preserves monotonicity.
 */
export function limbAlphaGate(occlusionOpacity: number): number {
  return smoothstep(0, LIMB_ALPHA_GATE_WINDOW, occlusionOpacity);
}
