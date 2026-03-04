/**
 * NightOverlay Component
 *
 * Renders a semi-transparent dark overlay on the night side of the globe.
 * Uses a custom shader to calculate day/night based on sun position.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { getSubsolarPoint } from "@/lib/utils/sun";

interface NightOverlayProps {
  /** Current display time */
  date: Date;
  /** Overlay opacity */
  opacity?: number;
}

export function NightOverlay({ date, opacity = 0.5 }: NightOverlayProps) {
  // Calculate subsolar point
  const subsolar = useMemo(() => getSubsolarPoint(date), [date]);

  // Custom shader material for night overlay
  const material = useMemo(() => {
    // Convert lat/lon to 3D using same coordinate system as globe
    const phi = ((90 - subsolar.lat) * Math.PI) / 180;
    const theta = ((subsolar.lon + 180) * Math.PI) / 180;

    const sunVec = new THREE.Vector3(
      -Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );

    return new THREE.ShaderMaterial({
      uniforms: {
        sunPosition: { value: sunVec },
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
    });
  }, [subsolar, opacity]);

  return (
    <mesh renderOrder={10}>
      <sphereGeometry args={[1.02, 64, 64]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
