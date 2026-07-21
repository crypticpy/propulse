/**
 * MUFOverlay Component
 *
 * Renders the MUF (Maximum Usable Frequency) overlay on the globe using a
 * GLSL fragment shader.
 *
 * IMPORTANT: the shader's calculateMUF() is an exact port of estimateMUF()
 * in src/lib/api/muf.ts — the single MUF model shared by Path Analysis, the
 * mini forecast panel, and the flat-map MUF overlay. Any change to one MUST
 * be mirrored in the other, or the globe will color a location differently
 * than the numbers shown elsewhere in the app.
 *
 * Color gradient (8 bands, smooth interpolation):
 *   <3 MHz   deep maroon (nighttime, no HF)
 *   3-5 MHz  red (80m/60m)
 *   5-7 MHz  orange (40m)
 *   7-10 MHz amber (40m-30m)
 *   10-14 MHz yellow-green (30m-20m)
 *   14-21 MHz green (20m-15m)
 *   21-28 MHz cyan (15m-10m)
 *   >28 MHz  blue-violet (10m+, excellent)
 *
 * GPU optimization: ShaderMaterial is created ONCE via useRef and uniforms
 * are updated via useEffect, avoiding shader recompilation on date changes.
 * The 128x128 sphere geometry (33K vertices) is also memoized separately.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getSubsolarPoint } from "@/lib/utils/sun";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

interface MUFOverlayProps {
  /** Current display time */
  date: Date;
  /** Solar Flux Index */
  sfi: number;
  /** Overlay opacity (0-1) */
  opacity?: number;
}

// ---------------------------------------------------------------------------
// Vertex shader
// ---------------------------------------------------------------------------
const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying vec3 vViewDir;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = normalize(worldPos.xyz);
    vUv = uv;

    // View direction for Fresnel
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);

    gl_Position = projectionMatrix * mvPos;
  }
`;

// ---------------------------------------------------------------------------
// Fragment shader — high-fidelity MUF model
// ---------------------------------------------------------------------------
const fragmentShader = /* glsl */ `
  uniform vec3 sunPosition;
  uniform float sfi;
  uniform float opacity;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying vec3 vViewDir;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  #define PI  3.14159265
  #define DEG 0.01745329  // PI/180
  #define RAD 57.2957795  // 180/PI

  // ---------------------------------------------------------------------------
  // MUF calculation — EXACT PORT of estimateMUF() in src/lib/api/muf.ts.
  // Keep the two in lockstep: this shader colors the globe with the same
  // numbers Path Analysis and the flat-map overlay display.
  // ---------------------------------------------------------------------------
  float calculateMUF(vec3 pos, vec3 sunPos, float solarFlux) {
    // Base critical frequency (f0F2) from SFI
    float effectiveSFI = max(solarFlux, 65.0);
    float f0F2 = 0.15 * sqrt(max(effectiveSFI - 60.0, 5.0)) + 4.0;

    // Solar zenith angle: cos(chi) is the dot product of the surface point
    // and the subsolar direction (both unit vectors)
    float cosChi = clamp(dot(pos, sunPos), -1.0, 1.0);
    float chiDeg = acos(cosChi) * RAD;

    // Latitude correction factor (slightly higher MUF near the equator)
    float geoLat = asin(clamp(pos.y, -1.0, 1.0)); // radians
    float latFactor = 1.0 + 0.1 * cos(abs(geoLat));

    float mufFactor = 3.6;
    float muf;

    if (chiDeg > 90.0) {
      // Night side — exponential decay with depth into night
      float nightDepth = (chiDeg - 90.0) / 90.0;
      muf = f0F2 * 2.0 * (1.0 - nightDepth * 0.4);
    } else if (chiDeg > 80.0) {
      // Twilight transition (80-90 deg)
      float twilightFactor = (90.0 - chiDeg) / 10.0;
      float dayMUF = f0F2 * mufFactor * pow(max(cosChi, 0.0), 0.5);
      float nightMUF = f0F2 * 2.0;
      muf = nightMUF + (dayMUF - nightMUF) * twilightFactor;
    } else {
      // Day side — full solar ionization
      muf = f0F2 * mufFactor * pow(max(cosChi, 0.0), 0.5);
    }

    return max(3.5, muf * latFactor);
  }

  // ---------------------------------------------------------------------------
  // 8-band color gradient
  // ---------------------------------------------------------------------------
  vec3 getMUFColor(float muf) {
    // Define 8 colour stops
    vec3 c0 = vec3(0.45, 0.08, 0.12);   // <3  deep maroon
    vec3 c1 = vec3(0.85, 0.18, 0.15);   // 3   red
    vec3 c2 = vec3(0.95, 0.50, 0.10);   // 5   orange
    vec3 c3 = vec3(0.95, 0.72, 0.10);   // 7   amber
    vec3 c4 = vec3(0.75, 0.88, 0.20);   // 10  yellow-green
    vec3 c5 = vec3(0.15, 0.78, 0.40);   // 14  green
    vec3 c6 = vec3(0.10, 0.72, 0.85);   // 21  cyan
    vec3 c7 = vec3(0.30, 0.35, 0.92);   // 28+ blue-violet

    // Frequency thresholds
    float f0 = 3.0;
    float f1 = 5.0;
    float f2 = 7.0;
    float f3 = 10.0;
    float f4 = 14.0;
    float f5 = 21.0;
    float f6 = 28.0;

    vec3 color;
    if (muf < f0) {
      color = c0;
    } else if (muf < f1) {
      color = mix(c1, c2, (muf - f0) / (f1 - f0));
    } else if (muf < f2) {
      color = mix(c2, c3, (muf - f1) / (f2 - f1));
    } else if (muf < f3) {
      color = mix(c3, c4, (muf - f2) / (f3 - f2));
    } else if (muf < f4) {
      color = mix(c4, c5, (muf - f3) / (f4 - f3));
    } else if (muf < f5) {
      color = mix(c5, c6, (muf - f4) / (f5 - f4));
    } else if (muf < f6) {
      color = mix(c6, c7, (muf - f5) / (f6 - f5));
    } else {
      color = c7;
    }

    return color;
  }

  // ---------------------------------------------------------------------------
  // Main
  // ---------------------------------------------------------------------------
  void main() {
    float muf = calculateMUF(vWorldPosition, sunPosition, sfi);
    vec3 color = getMUFColor(muf);

    // ── Fresnel limb darkening ──────────────────────────────────────────
    // Fade towards edges of the globe for a realistic spherical depth cue.
    float fresnel = dot(vNormal, vViewDir);
    float limbFade = smoothstep(0.0, 0.35, fresnel);

    gl_FragColor = vec4(color, opacity * limbFade);
  }
`;

/** Reusable vector for sun direction updates (avoids allocation per effect) */
const _sunVec = new THREE.Vector3();

export function MUFOverlay({ date, sfi, opacity = 0.45 }: MUFOverlayProps) {
  // Calculate subsolar point for the shader
  const subsolar = useMemo(() => getSubsolarPoint(date), [date]);

  // Memoize the 128x128 sphere geometry separately (33K vertices, created once)
  const geometry = useMemo(() => new THREE.SphereGeometry(1.007, 128, 128), []);

  // Create ShaderMaterial ONCE via useRef — avoids shader recompilation
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  if (materialRef.current === null) {
    const phi = ((90 - subsolar.lat) * Math.PI) / 180;
    const theta = ((subsolar.lon + 180) * Math.PI) / 180;

    materialRef.current = new THREE.ShaderMaterial({
      uniforms: {
        sunPosition: {
          value: new THREE.Vector3(
            -Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta),
          ),
        },
        sfi: { value: sfi },
        opacity: { value: opacity },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      depthTest: false,
    });
  }

  // Update uniforms when dependencies change (NO shader recompilation)
  useEffect(() => {
    if (!materialRef.current) return;

    const phi = ((90 - subsolar.lat) * Math.PI) / 180;
    const theta = ((subsolar.lon + 180) * Math.PI) / 180;

    _sunVec.set(
      -Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );

    materialRef.current.uniforms.sunPosition.value.copy(_sunVec);
    materialRef.current.uniforms.sfi.value = sfi;
    materialRef.current.uniforms.opacity.value = opacity;
  }, [subsolar, sfi, opacity]);

  // Dispose GPU resources on unmount
  useEffect(() => {
    return () => {
      materialRef.current?.dispose();
      geometry.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh renderOrder={GLOBE_LAYER_ORDER.surfaceTexture}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={materialRef.current} attach="material" />
    </mesh>
  );
}
