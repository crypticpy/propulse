import { describe, expect, it } from "vitest";
import { LineMaterial } from "three-stdlib";
import {
  applyArcLimbFade,
  createArcLimbFadeUniforms,
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

  it("keeps a raised multi-hop arc visible slightly past the surface limb", () => {
    // A point at radius 1.3 clears the horizon at a lower dot product than a
    // point on the surface; treating every vertex as surface-height would clip
    // band-height arcs early.
    const dot = 1 / CAMERA_DISTANCE - 0.1;
    expect(getArcLimbFadeAlpha(1.3, dot, CAMERA_DISTANCE)).toBeGreaterThan(
      getArcLimbFadeAlpha(1.0, dot, CAMERA_DISTANCE),
    );
  });

  it("returns full alpha for degenerate inputs rather than blanking arcs", () => {
    expect(getArcLimbFadeAlpha(0, 0.5, CAMERA_DISTANCE)).toBe(1);
    expect(getArcLimbFadeAlpha(SURFACE_RADIUS, 0.5, 0)).toBe(1);
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
    expect(uniforms.uLimbBaseDot.value).toBeCloseTo(0.25, 10);
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
    expect(updateArcLimbFadeUniforms(uniforms, { x: 0, y: 0, z: 0 }, 0)).toBe(
      false,
    );
    expect(uniforms.uLimbBaseDot.value).toBe(0);
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
    expect(shader.uniforms.uLimbBaseDot).toBe(uniforms.uLimbBaseDot);
    expect(shader.fragmentShader).toContain("alpha * vLimbFade");
  });

  it("is a no-op for a missing material", () => {
    expect(() =>
      applyArcLimbFade(null, createArcLimbFadeUniforms()),
    ).not.toThrow();
  });
});
