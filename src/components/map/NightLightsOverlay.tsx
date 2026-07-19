/**
 * NightLightsOverlay Component
 *
 * Renders city lights on the dark side of the globe using NASA Black Marble
 * style imagery. Uses a shader to blend lights based on sun position,
 * creating a realistic day/night terminator effect.
 *
 * GPU optimization: ShaderMaterial is created ONCE via useRef and uniforms
 * are updated via useEffect, avoiding shader recompilation on date changes.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { getSubsolarPoint } from "@/lib/utils/sun";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

interface NightLightsOverlayProps {
  /** Current display time */
  date: Date;
  /** Intensity of the city lights (0-1) */
  intensity?: number;
}

/** Reusable vector for sun direction updates (avoids allocation per effect) */
const _sunVec = new THREE.Vector3();

export function NightLightsOverlay({
  date,
  intensity = 1.0,
}: NightLightsOverlayProps) {
  // Load city lights texture
  const nightLightsTexture = useTexture("/textures/earth-night.jpg");

  // Calculate subsolar point (where sun is directly overhead)
  const subsolar = useMemo(() => getSubsolarPoint(date), [date]);

  // Memoize geometry separately (created once, never recreated)
  const geometry = useMemo(() => new THREE.SphereGeometry(1.021, 64, 64), []);

  // Create ShaderMaterial ONCE via useRef — avoids shader recompilation
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  if (materialRef.current === null) {
    const phi = ((90 - subsolar.lat) * Math.PI) / 180;
    const theta = ((subsolar.lon + 180) * Math.PI) / 180;

    materialRef.current = new THREE.ShaderMaterial({
      uniforms: {
        nightLightsMap: { value: nightLightsTexture },
        sunPosition: {
          value: new THREE.Vector3(
            -Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta),
          ),
        },
        intensity: { value: intensity },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vPosition = normalize((modelMatrix * vec4(position, 1.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D nightLightsMap;
        uniform vec3 sunPosition;
        uniform float intensity;

        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          // Sample the night lights texture
          vec4 nightLights = texture2D(nightLightsMap, vUv);

          // Calculate angle between surface normal and sun direction
          // sunDot > 0 means facing sun (day), < 0 means away (night)
          float sunDot = dot(vPosition, sunPosition);

          // Create smooth terminator transition
          // Lights fade in during twilight (-0.1 to 0.1)
          // and are fully visible on the night side
          float nightAmount = smoothstep(0.15, -0.1, sunDot);

          // Extract brightness from the texture
          // Use max of RGB for city light intensity
          float lightBrightness = max(nightLights.r, max(nightLights.g, nightLights.b));

          // Boost the lights to make cities more visible
          // Apply a power curve to increase contrast
          // Also apply a threshold mask so dark ocean/land pixels don't contribute
          // (prevents JPEG macroblocking artifacts from showing in the night side).
          float lightMask = smoothstep(0.18, 0.35, lightBrightness);
          float boostedLight = pow(lightBrightness, 0.6) * 1.5 * lightMask;

          // Warm color tint for city lights (yellowish-orange glow)
          vec3 lightColor = vec3(1.0, 0.85, 0.6) * boostedLight;

          // Apply night fade and intensity
          float finalAlpha = nightAmount * boostedLight * intensity;

          // Add slight blue tint to less bright areas (rural/suburban)
          vec3 finalColor = mix(
            vec3(0.4, 0.6, 1.0) * boostedLight * 0.3,
            lightColor,
            step(0.15, lightBrightness)
          );

          gl_FragColor = vec4(finalColor, finalAlpha);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
  }

  // Update uniforms when subsolar point or intensity changes (NO shader recompilation)
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
    materialRef.current.uniforms.intensity.value = intensity;
  }, [subsolar, intensity]);

  // Keep texture uniform in sync if texture reference changes
  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.nightLightsMap.value = nightLightsTexture;
  }, [nightLightsTexture]);

  // Dispose GPU resources on unmount
  useEffect(() => {
    return () => {
      materialRef.current?.dispose();
      geometry.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh renderOrder={GLOBE_LAYER_ORDER.nightLights}>
      {/* Slightly larger than Earth sphere to prevent z-fighting */}
      <primitive object={geometry} attach="geometry" />
      <primitive object={materialRef.current} attach="material" />
    </mesh>
  );
}
