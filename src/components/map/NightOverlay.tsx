/**
 * NightOverlay Component
 *
 * Renders a semi-transparent dark overlay on the night side of the globe.
 * Uses a custom shader to calculate day/night based on sun position.
 *
 * GPU optimization: ShaderMaterial is created ONCE via useRef and uniforms
 * are updated via useEffect, avoiding shader recompilation on date changes.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getSubsolarPoint } from "@/lib/utils/sun";

interface NightOverlayProps {
  /** Current display time */
  date: Date;
  /** Overlay opacity */
  opacity?: number;
}

/** Reusable vector for sun direction updates (avoids allocation per effect) */
const _sunVec = new THREE.Vector3();

export function NightOverlay({ date, opacity = 0.5 }: NightOverlayProps) {
  // Calculate subsolar point
  const subsolar = useMemo(() => getSubsolarPoint(date), [date]);

  // Memoize geometry separately (created once, never recreated)
  const geometry = useMemo(() => new THREE.SphereGeometry(1.02, 64, 64), []);

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
        opacity: { value: opacity },
      },
      vertexShader: `
        varying vec3 vPosition;

        void main() {
          vPosition = normalize((modelMatrix * vec4(position, 1.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunPosition;
        uniform float opacity;

        varying vec3 vPosition;

        void main() {
          float sunDot = dot(vPosition, sunPosition);

          // Night side: sunDot < 0, Twilight: near 0, Day: sunDot > 0
          float nightAmount = smoothstep(0.1, -0.2, sunDot);
          float alpha = nightAmount * opacity;

          // Dark blue-black tint on night side, fully transparent on day side
          gl_FragColor = vec4(0.02, 0.02, 0.06, alpha);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      depthTest: false,
    });
  }

  // Update uniforms when subsolar point or opacity changes (NO shader recompilation)
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
    materialRef.current.uniforms.opacity.value = opacity;
  }, [subsolar, opacity]);

  // Dispose GPU resources on unmount
  useEffect(() => {
    return () => {
      materialRef.current?.dispose();
      geometry.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh renderOrder={10}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={materialRef.current} attach="material" />
    </mesh>
  );
}
