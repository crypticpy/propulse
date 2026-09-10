/**
 * Limb fade for globe spot arcs.
 *
 * Arcs are drawn with `<Line>` (three's `LineMaterial`) and used to rely on the
 * GPU depth test alone to hide the half of a great circle that runs behind the
 * globe. A depth test is a binary decision taken per fragment against a
 * transparent-pass basemap, so at grazing angles whole sets of long arcs pop in
 * and out over two or three degrees of rotation while their spot tags stay put.
 *
 * This module gives arcs the same limb ramp the labels and markers already use
 * (`src/lib/map/globeOcclusion.ts`): a per-vertex dot product against the
 * camera direction, smoothstepped across the shared fade band and then through
 * the shared `limbAlphaGate` window, multiplied into the fragment alpha. Depth
 * testing is left exactly as it was — this only softens the horizon crossing.
 *
 * Two details matter for correctness:
 *
 * - Globe overlays live inside GlobeView's 23.5-degree tilt group, so the
 *   camera direction is transformed into globe-local space once per frame by
 *   `createGlobeOcclusionFrame` and uploaded as a uniform. The vertex shader
 *   never sees world space.
 * - Arc vertices are not on the unit sphere: flat arcs sit at radius 1.005 and
 *   band-height (multi-hop) arcs rise to about 1.28. A raised vertex stays
 *   visible well past the surface limb, so the shader compares it against the
 *   horizon dot for its own radius (see `getArcLimbClearance`) rather than
 *   against a surface-height threshold.
 *
 * All arcs share ONE uniforms object updated by a single `useFrame` in
 * `LiveSpotArcs`, so adding the fade costs one vector update per frame rather
 * than one per arc.
 */

import * as THREE from "three";
import {
  createGlobeOcclusionFrame,
  LIMB_ALPHA_GATE_WINDOW,
  LIMB_FADE_AFTER,
  LIMB_FADE_BEFORE,
  limbAlphaGate,
  smoothstep,
} from "./globeOcclusion";

/** Shared uniform block. One instance is reused by every arc material. */
export interface ArcLimbFadeUniforms {
  /** Camera direction rotated into globe-local space (unit length). */
  uLimbCameraDir: { value: THREE.Vector3 };
  /** Camera distance from the globe centre, in globe radii. */
  uLimbCameraDistance: { value: number };
}

export function createArcLimbFadeUniforms(): ArcLimbFadeUniforms {
  return {
    uLimbCameraDir: { value: new THREE.Vector3(0, 0, 1) },
    // Until the first frame runs, a huge camera distance puts the tangency
    // plane at the equator and the shadow cone at its narrowest, so nothing
    // flashes out on mount.
    uLimbCameraDistance: { value: 1e6 },
  };
}

/**
 * Refresh the shared uniforms from the current camera. Safe to call every
 * frame; returns false when the camera position is degenerate.
 */
export function updateArcLimbFadeUniforms(
  uniforms: ArcLimbFadeUniforms,
  cameraPosition: { x: number; y: number; z: number },
  tiltDegrees: number,
): boolean {
  const frame = createGlobeOcclusionFrame(cameraPosition, tiltDegrees);
  if (!frame) return false;
  uniforms.uLimbCameraDir.value.set(
    frame.localCameraX,
    frame.localCameraY,
    frame.localCameraZ,
  );
  uniforms.uLimbCameraDistance.value = frame.cameraDistance;
  return true;
}

/**
 * Signed clearance between an arc vertex and the globe's shadow, expressed in
 * the same units the labels use: `dot(normalize(P), cameraDir)` minus the dot
 * at which a vertex of this radius crosses the horizon. Positive is visible,
 * 0 is the exact boundary, negative is hidden.
 *
 * A vertex at radius `r` seen from distance `D` is hidden when it lies inside
 * the globe's shadow cone, whose surface satisfies `rho * sqrt(D^2 - 1) + z =
 * D` for `z = r*n`, `rho = r*sqrt(1 - n^2)`. Solving that quadratic for `n`
 * and keeping the far-side root gives the boundary dot
 *
 *     n* = ( 1/r - sqrt(D^2 - 1) * sqrt(1 - 1/r^2) ) / D
 *
 * At `r = 1` the second term vanishes and `n* = 1/D`, exactly the threshold
 * `getGlobeOcclusionOpacity` uses for labels — so `clearance = n - n*` is the
 * labels' own fade coordinate and the same smoothstep band applies unchanged.
 * For a band-height arc peak (`r ~= 1.283`, `D = 2.5`) it gives `n* ~= -0.262`:
 * the peak stays visible tens of degrees past the surface limb, as it does on
 * screen. The superseded `1 / (r * D)` threshold was the tangency condition
 * for a point ON a sphere of radius r, not for a point at radius r outside the
 * unit globe, and zeroed those peaks at `n ~= 0.19`.
 */
export function getArcLimbClearance(
  pointRadius: number,
  dotNormal: number,
  cameraDistance: number,
): number {
  const silhouette = Math.sqrt(
    Math.max(0, cameraDistance * cameraDistance - 1),
  );
  const inverseRadius = 1 / pointRadius;
  const rise = Math.sqrt(Math.max(0, 1 - inverseRadius * inverseRadius));
  const boundaryDot = (inverseRadius - silhouette * rise) / cameraDistance;
  return dotNormal - boundaryDot;
}

/**
 * CPU mirror of the shader math, exported so the ramp is testable without a
 * WebGL context (an r3f `<Canvas>` renders nothing in jsdom).
 *
 * @param pointRadius distance of the arc vertex from the globe centre
 * @param dotNormal `dot(normalize(vertex), cameraDirection)` in globe-local space
 * @param cameraDistance distance of the camera from the globe centre
 */
export function getArcLimbFadeAlpha(
  pointRadius: number,
  dotNormal: number,
  cameraDistance: number,
): number {
  if (!(pointRadius > 0) || !(cameraDistance > 1)) return 1;
  const clearance = getArcLimbClearance(pointRadius, dotNormal, cameraDistance);
  const occlusion = smoothstep(-LIMB_FADE_AFTER, LIMB_FADE_BEFORE, clearance);
  return limbAlphaGate(occlusion);
}

const glsl = (value: number) => value.toFixed(6);

const VERTEX_PARS = `
uniform vec3 uLimbCameraDir;
uniform float uLimbCameraDistance;
varying float vLimbFade;
`;

// `position.y < 0.5` is LineMaterial's own convention for "this quad corner
// belongs to the segment start", reused here so the fade is evaluated at the
// real arc vertex rather than at the expanded stroke corner.
const VERTEX_MAIN = `
	vec3 limbPoint = ( position.y < 0.5 ) ? instanceStart : instanceEnd;
	float limbRadius = max( length( limbPoint ), 1e-4 );
	float limbDotN = dot( limbPoint, uLimbCameraDir ) / limbRadius;
	float limbSilhouette = sqrt( max( uLimbCameraDistance * uLimbCameraDistance - 1.0, 0.0 ) );
	float limbInverseRadius = 1.0 / limbRadius;
	float limbRise = sqrt( max( 1.0 - limbInverseRadius * limbInverseRadius, 0.0 ) );
	float limbBoundary = ( limbInverseRadius - limbSilhouette * limbRise ) / uLimbCameraDistance;
	float limbClearance = limbDotN - limbBoundary;
	float limbOcclusion = smoothstep( ${glsl(-LIMB_FADE_AFTER)}, ${glsl(LIMB_FADE_BEFORE)}, limbClearance );
	vLimbFade = smoothstep( 0.0, ${glsl(LIMB_ALPHA_GATE_WINDOW)}, limbOcclusion );
`;

const FRAGMENT_PARS = `
varying float vLimbFade;
`;

const MAIN_ANCHOR = "void main() {";
const DIFFUSE_ANCHOR = "vec4 diffuseColor = vec4( diffuse, alpha );";

export interface ArcLimbFadeShaderSource {
  vertexShader: string;
  fragmentShader: string;
}

/**
 * Pure source transform, split out from {@link applyArcLimbFade} so the string
 * surgery can be tested directly against the shipped `LineMaterial` source.
 *
 * Returns `null` when either anchor is missing — if a three upgrade rewrites
 * the line shader we leave it untouched (arcs keep today's depth-test-only
 * behaviour) rather than emitting a half-patched program that fails to link.
 */
export function patchArcLimbFadeShader(
  source: ArcLimbFadeShaderSource,
): ArcLimbFadeShaderSource | null {
  if (
    !source.vertexShader.includes(MAIN_ANCHOR) ||
    !source.vertexShader.includes("instanceStart") ||
    !source.fragmentShader.includes(DIFFUSE_ANCHOR)
  ) {
    return null;
  }
  return {
    vertexShader: source.vertexShader.replace(
      MAIN_ANCHOR,
      `${VERTEX_PARS}${MAIN_ANCHOR}${VERTEX_MAIN}`,
    ),
    fragmentShader: source.fragmentShader
      .replace(
        DIFFUSE_ANCHOR,
        `vec4 diffuseColor = vec4( diffuse, alpha * vLimbFade );`,
      )
      .replace(MAIN_ANCHOR, `${FRAGMENT_PARS}${MAIN_ANCHOR}`),
  };
}

/**
 * Install the limb fade on one arc material, wiring it to the shared uniforms.
 * Idempotent: re-applying to the same material is a no-op. Accepts the array
 * form because `Object3D.material` is typed as one-or-many.
 */
export function applyArcLimbFade(
  material: THREE.Material | THREE.Material[] | null | undefined,
  uniforms: ArcLimbFadeUniforms,
): void {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const entry of material) applyArcLimbFade(entry, uniforms);
    return;
  }
  const tagged = material as THREE.Material & { __arcLimbFade?: boolean };
  if (tagged.__arcLimbFade) return;
  tagged.__arcLimbFade = true;

  material.onBeforeCompile = (shader) => {
    const patched = patchArcLimbFadeShader(shader);
    if (!patched) return;
    shader.uniforms.uLimbCameraDir = uniforms.uLimbCameraDir;
    shader.uniforms.uLimbCameraDistance = uniforms.uLimbCameraDistance;
    shader.vertexShader = patched.vertexShader;
    shader.fragmentShader = patched.fragmentShader;
  };
  material.needsUpdate = true;
}
