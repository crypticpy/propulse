/**
 * IonosphericShells Component
 *
 * Renders 4 translucent spherical shells around the globe representing
 * ionospheric layers (D, E, F1, F2). Each shell is positioned at a
 * dynamically calculated height based on solar conditions and uses a
 * custom shader to visualize day/night density variations.
 *
 * Layer characteristics:
 * - D layer (~85 km): Daytime absorption indicator, faint twilight remnant
 * - E layer (~110 km): Extends into twilight, sporadic E persists at night
 * - F1 layer (~185 km): Daytime only, merges with F2 at sunset
 * - F2 layer (~300 km): Always present, dominant nighttime layer
 *
 * Heights are exaggerated 5x for visibility on the globe.
 */

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getSubsolarPoint } from "@/lib/utils/sun";
import { calculateLayerHeights } from "@/lib/utils/ionosphere";
import { useCurrentSFI } from "@/hooks/useMUFData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IonosphericShellsProps {
  displayTime: Date;
}

/** Layer type enum matching shader uniform values */
const enum LayerType {
  D = 0,
  E = 1,
  F1 = 2,
  F2 = 3,
}

interface LayerConfig {
  type: LayerType;
  color: THREE.Vector3;
  baseOpacity: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;
const HEIGHT_EXAGGERATION = 5;
const SPHERE_SEGMENTS = 48;
const D_LAYER_HEIGHT_KM = 85;

const LAYER_CONFIGS: LayerConfig[] = [
  {
    type: LayerType.D,
    color: new THREE.Vector3(0.9, 0.35, 0.2),
    baseOpacity: 0.18,
  },
  {
    type: LayerType.E,
    color: new THREE.Vector3(0.2, 0.85, 0.4),
    baseOpacity: 0.15,
  },
  {
    type: LayerType.F1,
    color: new THREE.Vector3(0.3, 0.65, 0.95),
    baseOpacity: 0.13,
  },
  {
    type: LayerType.F2,
    color: new THREE.Vector3(0.65, 0.3, 0.95),
    baseOpacity: 0.16,
  },
];

// ---------------------------------------------------------------------------
// Shader source
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
  varying vec3 vPosition;
  varying vec3 vNormal;

  void main() {
    vPosition = normalize(position);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 sunPosition;
  uniform vec3 layerColor;
  uniform float opacity;
  uniform float sfi;
  uniform float time;
  uniform int layerType; // 0=D, 1=E, 2=F1, 3=F2

  varying vec3 vPosition;
  varying vec3 vNormal;

  void main() {
    // Solar zenith angle at this surface point
    float sunDot = dot(vPosition, sunPosition);
    float zenithAngle = acos(clamp(sunDot, -1.0, 1.0));
    float zenithDeg = zenithAngle * 57.29578;

    float density = 0.0;
    float sfiFactor = clamp((sfi - 60.0) / 120.0, 0.25, 1.0);

    if (layerType == 0) {
      // D layer: daytime absorption, warm glow — faint twilight remnant
      if (zenithDeg < 90.0) {
        density = pow(max(cos(zenithAngle), 0.0), 1.3);
      } else if (zenithDeg < 100.0) {
        density = 0.08 * (1.0 - (zenithDeg - 90.0) / 10.0);
      }
    } else if (layerType == 1) {
      // E layer: extends into twilight, sporadic E persists at night
      if (zenithDeg < 98.0) {
        density = pow(max(cos(zenithAngle), 0.0), 0.6);
        if (zenithDeg > 90.0) {
          density *= 1.0 - (zenithDeg - 90.0) / 8.0;
        }
      }
      // Sporadic E: faint at night
      density = max(density, 0.06 * sfiFactor);
    } else if (layerType == 2) {
      // F1: merges with F2 at night, visible in sunset/sunrise transition
      if (zenithDeg < 80.0) {
        density = pow(max(cos(zenithAngle), 0.0), 0.5) * sfiFactor;
      } else if (zenithDeg < 100.0) {
        float fade = 1.0 - (zenithDeg - 80.0) / 20.0;
        density = pow(max(cos(zenithAngle * 0.9), 0.0), 0.5) * sfiFactor * max(fade, 0.0);
      }
      // Faint residual at night (F1 merges into F2)
      density = max(density, 0.04 * sfiFactor);
    } else {
      // F2: always present — dominant nighttime layer
      float baseDensity = 0.35;

      // Diurnal: peaks around local noon
      float diurnal = 0.55 + 0.45 * max(sunDot, -0.15);
      density = baseDensity + (1.0 - baseDensity) * diurnal * sfiFactor;

      // Equatorial anomaly: boost near magnetic equator
      float lat = asin(vPosition.y) * 57.29578;
      float anomaly = 1.0 + 0.25 * exp(-pow(abs(lat) - 15.0, 2.0) / 200.0);
      density *= anomaly;

      // Night side: visible floor — F2 persists as the key nighttime layer
      float nightFloor = 0.20 + 0.10 * sfiFactor;
      density = max(density, nightFloor);
    }

    // Subtle shimmer
    float shimmer = 1.0 + 0.04 * sin(time * 0.5 + vPosition.x * 10.0 + vPosition.z * 10.0);
    density *= shimmer;

    // Fresnel-like edge glow (limb brightening for translucent shells)
    float viewDot = abs(dot(vNormal, normalize(cameraPosition - vPosition)));
    float limb = 1.0 - pow(viewDot, 0.5);
    density = mix(density, density * 1.4, limb * 0.3);

    gl_FragColor = vec4(layerColor, density * opacity);
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a subsolar point to a normalised sun direction vector in the
 * globe's coordinate system. Follows the same convention as MUFOverlay.
 */
function sunDirectionVector(date: Date): [number, number, number] {
  const { lat, lon } = getSubsolarPoint(date);
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ];
}

/**
 * Convert a height in km to a globe-space radius with exaggeration.
 */
function heightToRadius(heightKm: number): number {
  return 1.0 + (heightKm / EARTH_RADIUS_KM) * HEIGHT_EXAGGERATION;
}

/**
 * Create a ShaderMaterial for one ionospheric layer.
 */
function createLayerMaterial(
  config: LayerConfig,
  sunPos: THREE.Vector3,
  sfi: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunPosition: { value: sunPos.clone() },
      layerColor: { value: config.color.clone() },
      opacity: { value: config.baseOpacity },
      sfi: { value: sfi },
      time: { value: 0 },
      layerType: { value: config.type },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IonosphericShells({ displayTime }: IonosphericShellsProps) {
  const sfi = useCurrentSFI() ?? 100;
  const month = displayTime.getUTCMonth() + 1;

  // Refs for per-frame uniform updates
  const materialsRef = useRef<THREE.ShaderMaterial[]>([]);

  // --- Compute dynamic layer radii ---
  const radii = useMemo(() => {
    const h = calculateLayerHeights(45, month, sfi);
    return {
      d: heightToRadius(D_LAYER_HEIGHT_KM),
      e: heightToRadius(h.hmE),
      f1: heightToRadius(h.hmF1),
      f2: heightToRadius(h.hmF2),
    };
  }, [month, sfi]);

  // --- Sun direction vector (recalculated when displayTime changes) ---
  const sunPos = useMemo(() => {
    const [x, y, z] = sunDirectionVector(displayTime);
    return new THREE.Vector3(x, y, z);
  }, [displayTime]);

  // --- Materials (recreated only when structural inputs change) ---
  const materials = useMemo(() => {
    const mats = LAYER_CONFIGS.map((cfg) =>
      createLayerMaterial(cfg, sunPos, sfi),
    );
    materialsRef.current = mats;
    return mats;
  }, [sunPos, sfi]);

  // --- Per-frame updates: time uniform + sun position ---
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    for (const mat of materialsRef.current) {
      mat.uniforms.time.value = t;
      // Keep sun position and SFI in sync with latest values. Uniform objects
      // are mutated directly to avoid material recreation.
      mat.uniforms.sunPosition.value.copy(sunPos);
      mat.uniforms.sfi.value = sfi;
    }
  });

  // --- Dispose old materials on recreation ---
  useMemo(() => {
    return () => {
      for (const mat of materialsRef.current) {
        mat.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials]);

  // Ordered radii array matching LAYER_CONFIGS
  const layerRadii = [radii.d, radii.e, radii.f1, radii.f2];

  return (
    <group>
      {materials.map((mat, i) => (
        <mesh key={i} renderOrder={i + 1} frustumCulled={false}>
          <sphereGeometry
            args={[layerRadii[i], SPHERE_SEGMENTS, SPHERE_SEGMENTS]}
          />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}
    </group>
  );
}
