/**
 * MUFOverlay Component
 *
 * Renders a high-fidelity MUF (Maximum Usable Frequency) overlay on the globe
 * using a GLSL fragment shader with an ionospheric model incorporating:
 *
 * - Solar Flux Index (SFI) as the primary driver of foF2
 * - Solar zenith angle with realistic Chapman-layer ionization
 * - Equatorial anomaly (Appleton anomaly) dual crests at +/-15 deg geomagnetic latitude
 * - Seasonal tilt (summer hemisphere enhancement)
 * - Kp geomagnetic depression at mid-latitudes, auroral enhancement at high-lat
 * - Gradual day/night transition through the twilight zone
 * - Sunrise enhancement effect
 * - Fresnel limb darkening for visual depth
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

interface MUFOverlayProps {
  /** Current display time */
  date: Date;
  /** Solar Flux Index */
  sfi: number;
  /** Kp geomagnetic index (0-9) */
  kp?: number;
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
  uniform float kp;
  uniform float dayOfYear;
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

  // Geomagnetic north pole (IGRF-13 epoch 2025, approximate)
  // ~80.7 N, -72.7 W  (Ellesmere Island area)
  const float MAG_POLE_LAT = 80.7 * 0.01745329;
  const float MAG_POLE_LON = -72.7 * 0.01745329;

  // ---------------------------------------------------------------------------
  // Geomagnetic latitude (dipole approximation)
  //   sin(magLat) = sin(lat)*sin(poleLat) + cos(lat)*cos(poleLat)*cos(lon-poleLon)
  // ---------------------------------------------------------------------------
  float geomagLat(vec3 pos) {
    float lat = asin(clamp(pos.y, -1.0, 1.0));
    float lon = atan(pos.z, -pos.x); // globe coord system

    float sinMagLat = sin(lat) * sin(MAG_POLE_LAT)
                    + cos(lat) * cos(MAG_POLE_LAT) * cos(lon - MAG_POLE_LON);
    return asin(clamp(sinMagLat, -1.0, 1.0));
  }

  // ---------------------------------------------------------------------------
  // Smooth-step helpers
  // ---------------------------------------------------------------------------
  float smootherstep(float edge0, float edge1, float x) {
    float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  // ---------------------------------------------------------------------------
  // MUF calculation
  // ---------------------------------------------------------------------------
  float calculateMUF(vec3 pos, vec3 sunPos, float solarFlux, float kpIdx, float doy) {
    // ── 1. Base foF2 from SFI (empirical fit to IRI model) ───────────────
    // foF2 ~ 1.2 + 0.013 * SFI  (MHz)  — simplified URSI median
    float foF2_base = 1.2 + 0.013 * solarFlux;

    // ── 2. Solar zenith angle ────────────────────────────────────────────
    float cosChi = dot(pos, sunPos);                    // cos(zenith)
    float chi = acos(clamp(cosChi, -1.0, 1.0));        // zenith angle (rad)
    float chiDeg = chi * RAD;

    // ── 3. Chapman ionization factor ─────────────────────────────────────
    // The Chapman function for foF2: foF2 ∝ (cos chi)^0.3  (day)
    // with a smooth transition into the night side.
    float dayFactor;
    if (chiDeg < 75.0) {
      // Full day — Chapman production
      dayFactor = pow(max(cosChi, 0.001), 0.3);
    } else if (chiDeg < 100.0) {
      // Twilight zone (75-100 deg) — smooth sigmoid transition
      float dayEdge = pow(cos(75.0 * DEG), 0.3);
      float nightEdge = 0.18; // residual nighttime foF2 fraction
      float t = smootherstep(75.0, 100.0, chiDeg);
      dayFactor = mix(dayEdge, nightEdge, t);
    } else {
      // Deep night — slow residual decay
      float nightDepth = (chiDeg - 100.0) / 80.0;      // 0..1 over 80 deg
      dayFactor = 0.18 * (1.0 - nightDepth * 0.35);
      dayFactor = max(dayFactor, 0.08);
    }

    float foF2 = foF2_base * dayFactor;

    // ── 4. Latitude + geographic latitude correction ─────────────────────
    float geoLat = asin(clamp(pos.y, -1.0, 1.0));     // geographic lat (rad)
    float absGeoLat = abs(geoLat);

    // Mid-latitude enhancement (F2 layer thicker at ~30-45 deg)
    float midLatBoost = 1.0 + 0.12 * exp(-pow((absGeoLat * RAD - 35.0) / 20.0, 2.0));
    foF2 *= midLatBoost;

    // ── 5. Equatorial (Appleton) anomaly ─────────────────────────────────
    // Creates dual crests of enhanced foF2 at ~+/-15 deg geomagnetic latitude.
    // The anomaly is strongest on the dayside and around local afternoon.
    float magLat = geomagLat(pos);
    float absMagLat = abs(magLat) * RAD;  // degrees

    // Anomaly shape: Gaussian centred at 15 deg mag-lat with ~8 deg width
    float crest = exp(-pow((absMagLat - 15.0) / 8.0, 2.0));

    // Anomaly strength depends on solar zenith — strongest in daytime
    float anomalyDayside = smootherstep(95.0, 70.0, chiDeg); // 0 at night, 1 on day
    float anomalyStrength = 0.35 * anomalyDayside * crest;

    // Add a slight local-time asymmetry — stronger in afternoon
    // (Use longitude offset from subsolar point as a proxy for local time)
    float lonDiff = atan(pos.z, -pos.x) - atan(sunPos.z, -sunPos.x);
    float localTimeShift = sin(lonDiff) * 0.08 * anomalyDayside;

    foF2 *= (1.0 + anomalyStrength + localTimeShift);

    // ── 6. Seasonal correction ───────────────────────────────────────────
    // Summer hemisphere has ~15% higher foF2 due to longer UV exposure.
    // Use day-of-year to determine which hemisphere is in summer.
    float declination = 23.44 * sin((doy - 81.0) / 365.0 * 2.0 * PI) * DEG;
    float seasonSign = sign(geoLat) * sign(declination); // +1 if same hemisphere as summer
    float seasonalBoost = 1.0 + 0.12 * seasonSign * (1.0 - exp(-absGeoLat * 2.0));
    foF2 *= seasonalBoost;

    // ── 7. Sunrise enhancement ───────────────────────────────────────────
    // There is a transient pre-sunrise/sunrise peak in foF2 as the D-layer
    // has not yet formed to absorb, but E/F production is beginning.
    // Model as a bump at chi ~85-95 deg on the "approaching sunrise" side.
    // Detect sunrise side: morning side has negative local hour angle
    float hourAngle = atan(pos.z, -pos.x) - atan(sunPos.z, -sunPos.x);
    // Normalize to [-PI, PI]
    hourAngle = hourAngle - 2.0 * PI * floor((hourAngle + PI) / (2.0 * PI));
    bool isMorningSide = hourAngle > 0.0;

    if (isMorningSide && chiDeg > 80.0 && chiDeg < 100.0) {
      float srPeak = exp(-pow((chiDeg - 90.0) / 6.0, 2.0));
      foF2 *= (1.0 + 0.15 * srPeak);
    }

    // ── 8. Kp geomagnetic correction ─────────────────────────────────────
    // Storm effects: high Kp depresses mid-lat foF2 ("negative storm phase")
    // but can enhance auroral zone foF2 via particle precipitation.
    float kpNorm = kpIdx / 9.0;  // 0..1

    // Mid-latitude depression — strongest at 30-60 deg
    float midLatWeight = exp(-pow((absGeoLat * RAD - 45.0) / 25.0, 2.0));
    float kpDepression = 1.0 - 0.22 * kpNorm * kpNorm * midLatWeight;

    // High-latitude (auroral) enhancement
    float auroralWeight = exp(-pow((absMagLat - 67.0) / 8.0, 2.0));
    float kpAuroralBoost = 1.0 + 0.30 * kpNorm * auroralWeight;

    foF2 *= kpDepression * kpAuroralBoost;

    // ── 9. MUF from foF2 ────────────────────────────────────────────────
    // MUF(3000)F2 ≈ foF2 * M(3000)F2
    // M-factor for a 3000km path is typically 2.8 - 3.8.
    // We use a latitude-dependent M-factor (higher at equator).
    float mFactor = 3.2 + 0.4 * cos(absGeoLat);

    float muf = foF2 * mFactor;

    return max(muf, 1.5);
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
    float muf = calculateMUF(vWorldPosition, sunPosition, sfi, kp, dayOfYear);
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

export function MUFOverlay({
  date,
  sfi,
  kp = 2,
  opacity = 0.45,
}: MUFOverlayProps) {
  // Calculate subsolar point for the shader
  const subsolar = useMemo(() => getSubsolarPoint(date), [date]);

  // Day of year for seasonal correction
  const dayOfYear = useMemo(() => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }, [date]);

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
        kp: { value: kp },
        dayOfYear: { value: dayOfYear },
        opacity: { value: opacity },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
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
    materialRef.current.uniforms.kp.value = kp;
    materialRef.current.uniforms.dayOfYear.value = dayOfYear;
    materialRef.current.uniforms.opacity.value = opacity;
  }, [subsolar, sfi, kp, dayOfYear, opacity]);

  // Dispose GPU resources on unmount
  useEffect(() => {
    return () => {
      materialRef.current?.dispose();
      geometry.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh>
      <primitive object={geometry} attach="geometry" />
      <primitive object={materialRef.current} attach="material" />
    </mesh>
  );
}
