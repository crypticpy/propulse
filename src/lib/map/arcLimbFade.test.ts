import { describe, expect, it } from "vitest";
import { LineMaterial } from "three-stdlib";
import {
  applyArcLimbFade,
  createArcLimbFadeUniforms,
  getArcLimbClearance,
  getArcLimbFadeAlpha,
  patchArcLimbFadeShader,
  updateArcLimbFadeUniforms,
} from "./arcLimbFade";
import {
  getGlobeOcclusionOpacity,
  limbAlphaGate,
  LIMB_ALPHA_GATE_WINDOW,
} from "./globeOcclusion";

const CAMERA_DISTANCE = 2.5;
const SURFACE_RADIUS = 1.005;

describe("getArcLimbFadeAlpha", () => {
  it("is fully opaque at the sub-camera point and fully transparent well past the limb", () => {
    expect(getArcLimbFadeAlpha(SURFACE_RADIUS, 1, CAMERA_DISTANCE)).toBe(1);
    expect(getArcLimbFadeAlpha(SURFACE_RADIUS, -1, CAMERA_DISTANCE)).toBe(0);
  });

  it("ramps monotonically across the limb instead of popping", () => {
    const samples: number[] = [];
    for (let dot = -0.4; dot <= 1.0001; dot += 0.005) {
      samples.push(getArcLimbFadeAlpha(SURFACE_RADIUS, dot, CAMERA_DISTANCE));
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
    // The ramp must actually be a ramp: intermediate values, not a step. The
    // composed window is ~0.053 in dot units, roughly 3 degrees of rotation at
    // this camera distance, so it needs a fine sweep to see.
    const partial = samples.filter((a) => a > 0.001 && a < 0.999);
    expect(partial.length).toBeGreaterThan(5);
  });

  it("uses the same window as the label gate for a unit-radius point", () => {
    // A tag and its arc must disappear together. At radius 1 the arc math
    // reduces to limbAlphaGate(getGlobeOcclusionOpacity(...)), which is
    // exactly what SpotLabel multiplies its floored alpha by.
    const frameDistance = 3;
    for (const dot of [-0.2, 0.1, 0.3, 0.32, 0.36, 0.4, 0.8]) {
      const occlusion = occlusionFromDot(dot, frameDistance);
      expect(getArcLimbFadeAlpha(1, dot, frameDistance)).toBeCloseTo(
        limbAlphaGate(occlusion),
        10,
      );
    }
  });

  it("keeps a band-height arc peak visible far past the surface limb", () => {
    // bandHeightArcs vertices reach r ~= 1.283. At D = 2.5 the globe does not
    // cover such a point until dot ~= -0.26, tens of degrees past the surface
    // limb at dot = 0.4. The superseded 1/(r*D) threshold zeroed it at
    // dot ~= 0.19, which erased the peaks of every multi-hop arc.
    const r = 1.283;
    expect(getArcLimbFadeAlpha(r, 0.19, CAMERA_DISTANCE)).toBe(1);
    expect(getArcLimbFadeAlpha(r, -0.2, CAMERA_DISTANCE)).toBe(1);
    // The boundary itself sits at n* = (1/r - sqrt(D^2-1)*sqrt(1-1/r^2)) / D
    // = -0.2624 for these inputs: still (just) visible at -0.26, gone below.
    expect(getArcLimbClearance(r, -0.26, CAMERA_DISTANCE)).toBeGreaterThan(0);
    expect(getArcLimbClearance(r, -0.26, CAMERA_DISTANCE)).toBeLessThan(0.01);
    expect(getArcLimbClearance(r, -0.2624, CAMERA_DISTANCE)).toBeCloseTo(0, 3);
    expect(getArcLimbFadeAlpha(r, -0.45, CAMERA_DISTANCE)).toBe(0);
    // A surface vertex at the same dot is long gone.
    expect(getArcLimbFadeAlpha(1.0, -0.2, CAMERA_DISTANCE)).toBe(0);
  });

  it("reduces to the labels' dot > 1/D threshold at unit radius", () => {
    // Analytic check: at r = 1 the clearance IS dot - 1/D, so the arc band and
    // the label band are the same ramp in the same units.
    for (const dot of [-0.5, 0, 0.2, 0.4, 0.41, 0.6, 1]) {
      expect(getArcLimbClearance(1, dot, CAMERA_DISTANCE)).toBeCloseTo(
        dot - 1 / CAMERA_DISTANCE,
        10,
      );
    }
    expect(getArcLimbClearance(1, 1 / CAMERA_DISTANCE, CAMERA_DISTANCE)).toBe(
      0,
    );
  });

  it("returns full alpha for degenerate inputs rather than blanking arcs", () => {
    expect(getArcLimbFadeAlpha(0, 0.5, CAMERA_DISTANCE)).toBe(1);
    expect(getArcLimbFadeAlpha(SURFACE_RADIUS, 0.5, 0)).toBe(1);
    // A camera inside the globe has no limb at all.
    expect(getArcLimbFadeAlpha(SURFACE_RADIUS, -1, 0.5)).toBe(1);
  });
});

/**
 * Occlusion opacity for a point whose surface normal makes `dot` with the
 * camera direction, expressed through the shipped label path so this test
 * cannot drift from it: place the point at the equator and aim the camera at
 * the matching longitude.
 */
function occlusionFromDot(dot: number, cameraDistance: number): number {
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  const lon = -180 + (angle * 180) / Math.PI;
  return getGlobeOcclusionOpacity(0, lon, {
    cameraDistance,
    localCameraX: -1,
    localCameraY: 0,
    localCameraZ: 0,
  });
}

describe("updateArcLimbFadeUniforms", () => {
  it("publishes the globe-local camera direction and the unit limb dot", () => {
    const uniforms = createArcLimbFadeUniforms();
    expect(
      updateArcLimbFadeUniforms(uniforms, { x: 0, y: 0, z: 4 }, 23.5),
    ).toBe(true);
    expect(uniforms.uLimbCameraDistance.value).toBeCloseTo(4, 10);
    // Z is the tilt axis, so a camera on +Z is unchanged by the tilt.
    expect(uniforms.uLimbCameraDir.value.toArray()).toEqual([0, 0, 1]);

    // The 23.5-degree tilt group must be undone, or every arc fades on the
    // wrong side of the globe.
    updateArcLimbFadeUniforms(uniforms, { x: 4, y: 0, z: 0 }, 23.5);
    expect(uniforms.uLimbCameraDir.value.x).toBeCloseTo(
      Math.cos((23.5 * Math.PI) / 180),
      10,
    );
    expect(uniforms.uLimbCameraDir.value.y).toBeCloseTo(
      -Math.sin((23.5 * Math.PI) / 180),
      10,
    );
  });

  it("leaves the uniforms untouched for a degenerate camera", () => {
    const uniforms = createArcLimbFadeUniforms();
    const before = uniforms.uLimbCameraDistance.value;
    expect(updateArcLimbFadeUniforms(uniforms, { x: 0, y: 0, z: 0 }, 0)).toBe(
      false,
    );
    expect(uniforms.uLimbCameraDistance.value).toBe(before);
  });
});

describe("patchArcLimbFadeShader", () => {
  it("patches the shipped LineMaterial source", () => {
    const material = new LineMaterial();
    const patched = patchArcLimbFadeShader({
      vertexShader: material.vertexShader,
      fragmentShader: material.fragmentShader,
    });
    expect(patched).not.toBeNull();
    // Guard the anchors: the vertex fade must be computed inside main, after
    // the declarations, and the fragment must consume it on the alpha channel.
    expect(patched!.vertexShader).toContain("varying float vLimbFade;");
    expect(patched!.vertexShader).toContain(
      "vec3 limbPoint = ( position.y < 0.5 ) ? instanceStart : instanceEnd;",
    );
    expect(patched!.vertexShader).toContain(
      "float limbClearance = limbDotN - limbBoundary;",
    );
    expect(
      patched!.vertexShader.indexOf("uniform vec3 uLimbCameraDir;"),
    ).toBeLessThan(patched!.vertexShader.indexOf("vec3 limbPoint ="));
    expect(patched!.fragmentShader).toContain(
      "vec4 diffuseColor = vec4( diffuse, alpha * vLimbFade );",
    );
    expect(
      patched!.fragmentShader.indexOf("varying float vLimbFade;"),
    ).toBeLessThan(patched!.fragmentShader.indexOf("void main() {"));
    // The gate window is inlined into the vertex source from the shared
    // constant, so label and arc fades cannot drift apart.
    expect(patched!.vertexShader).toContain(LIMB_ALPHA_GATE_WINDOW.toFixed(6));
  });

  it("declines to patch a shader whose anchors are gone", () => {
    expect(
      patchArcLimbFadeShader({
        vertexShader: "void main() { gl_Position = vec4(0.0); }",
        fragmentShader: "void main() { gl_FragColor = vec4(1.0); }",
      }),
    ).toBeNull();
  });
});

describe("applyArcLimbFade", () => {
  it("wires the shared uniforms into the compiled shader exactly once", () => {
    const uniforms = createArcLimbFadeUniforms();
    const material = new LineMaterial();
    applyArcLimbFade(material, uniforms);
    const first = material.onBeforeCompile;
    applyArcLimbFade(material, uniforms);
    expect(material.onBeforeCompile).toBe(first);

    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: material.vertexShader,
      fragmentShader: material.fragmentShader,
    };
    material.onBeforeCompile(
      shader as unknown as Parameters<typeof material.onBeforeCompile>[0],
      undefined as never,
    );
    // Same object identity: every arc reads the one block the parent updates.
    expect(shader.uniforms.uLimbCameraDir).toBe(uniforms.uLimbCameraDir);
    expect(shader.uniforms.uLimbCameraDistance).toBe(
      uniforms.uLimbCameraDistance,
    );
    expect(shader.fragmentShader).toContain("alpha * vLimbFade");
  });

  it("is a no-op for a missing material", () => {
    expect(() =>
      applyArcLimbFade(null, createArcLimbFadeUniforms()),
    ).not.toThrow();
  });
});
