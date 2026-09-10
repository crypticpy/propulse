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
 *   band-height (multi-hop) arcs rise well above that. A point at radius r seen
 *   from distance D clears the horizon at `dot(normalize(P), cameraDir) =
 *   1 / (r * D)`, which reduces to the labels' `1 / D` when r is 1. The shader
 *   evaluates that per vertex so raised arcs are not clipped early.
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
  /** `1 / cameraDistance` — the limb dot product for a unit-radius point. */
  uLimbBaseDot: { value: number };
}

export function createArcLimbFadeUniforms(): ArcLimbFadeUniforms {
  return {
    uLimbCameraDir: { value: new THREE.Vector3(0, 0, 1) },
    // Until the first frame runs, a base dot of 0 keeps the whole visible
    // hemisphere at full alpha rather than flashing arcs out on mount.
    uLimbBaseDot: { value: 0 },
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
  uniforms.uLimbBaseDot.value = 1 / frame.cameraDistance;
  return true;
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
  if (!(pointRadius > 0) || !(cameraDistance > 0)) return 1;
  const limbDot = 1 / (pointRadius * cameraDistance);
  const occlusion = smoothstep(
    limbDot - LIMB_FADE_AFTER,
    limbDot + LIMB_FADE_BEFORE,
    dotNormal,
  );
  return limbAlphaGate(occlusion);
}

const glsl = (value: number) => value.toFixed(6);

const VERTEX_PARS = `
uniform vec3 uLimbCameraDir;
uniform float uLimbBaseDot;
varying float vLimbFade;
`;

// `position.y < 0.5` is LineMaterial's own convention for "this quad corner
// belongs to the segment start", reused here so the fade is evaluated at the
// real arc vertex rather than at the expanded stroke corner.
const VERTEX_MAIN = `
	vec3 limbPoint = ( position.y < 0.5 ) ? instanceStart : instanceEnd;
	float limbRadius = max( length( limbPoint ), 1e-4 );
	float limbDotN = dot( limbPoint / limbRadius, uLimbCameraDir );
	float limbThreshold = uLimbBaseDot / limbRadius;
	float limbOcclusion = smoothstep( limbThreshold - ${glsl(LIMB_FADE_AFTER)}, limbThreshold + ${glsl(LIMB_FADE_BEFORE)}, limbDotN );
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
    shader.uniforms.uLimbBaseDot = uniforms.uLimbBaseDot;
    shader.vertexShader = patched.vertexShader;
    shader.fragmentShader = patched.fragmentShader;
  };
  material.needsUpdate = true;
}
