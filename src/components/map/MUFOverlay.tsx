/**
 * MUFOverlay Component
 *
 * Renders a semi-transparent MUF (Maximum Usable Frequency) overlay on the globe.
 * Uses a custom shader to visualize MUF values across the globe with color coding:
 * - Red: < 7 MHz (low bands only)
 * - Yellow: 7-14 MHz (40m-20m)
 * - Green: 14-21 MHz (20m-15m)
 * - Blue: > 21 MHz (high bands open)
 */

import { useMemo } from "react";
import * as THREE from "three";
import { getSubsolarPoint } from "@/lib/utils/sun";

interface MUFOverlayProps {
  /** Current display time */
  date: Date;
  /** Solar Flux Index */
  sfi: number;
  /** Overlay opacity (0-1) */
  opacity?: number;
}

export function MUFOverlay({ date, sfi, opacity = 0.45 }: MUFOverlayProps) {
  // Calculate subsolar point for the shader
  const subsolar = useMemo(() => getSubsolarPoint(date), [date]);

  // Custom shader material for MUF visualization
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
        sfi: { value: sfi },
        opacity: { value: opacity },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = normalize((modelMatrix * vec4(position, 1.0)).xyz);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunPosition;
        uniform float sfi;
        uniform float opacity;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;

        // Calculate MUF based on position and SFI
        float calculateMUF(vec3 pos, vec3 sunPos, float solarFlux) {
          // Base critical frequency from SFI
          float f0F2 = 0.15 * sqrt(max(solarFlux - 60.0, 5.0)) + 4.0;

          // Calculate solar zenith angle (dot product with sun direction)
          float sunDot = dot(pos, sunPos);
          float zenithAngle = acos(clamp(sunDot, -1.0, 1.0));
          float zenithDeg = zenithAngle * 57.29578; // rad to deg

          // MUF factor for F2 layer
          float mufFactor = 3.6;

          // Latitude correction (get lat from position)
          float lat = asin(pos.y) * 57.29578;
          float latFactor = 1.0 + 0.1 * cos(abs(lat) * 0.01745);

          // Calculate MUF based on zenith angle
          float muf;

          if (zenithDeg > 90.0) {
            // Night side
            float nightDepth = (zenithDeg - 90.0) / 90.0;
            muf = f0F2 * 2.0 * (1.0 - nightDepth * 0.4);
          } else if (zenithDeg > 80.0) {
            // Twilight transition
            float twilightFactor = (90.0 - zenithDeg) / 10.0;
            float dayMUF = f0F2 * mufFactor * pow(cos(zenithAngle), 0.5);
            float nightMUF = f0F2 * 2.0;
            muf = nightMUF + (dayMUF - nightMUF) * twilightFactor;
          } else {
            // Day side
            float cosFactor = pow(cos(zenithAngle), 0.5);
            muf = f0F2 * mufFactor * cosFactor;
          }

          return max(muf, 3.5) * latFactor;
        }

        // Get color for MUF value
        vec3 getMUFColor(float muf) {
          // Color thresholds
          // < 7 MHz: Red (low bands only)
          // 7-14 MHz: Yellow (40m-20m)
          // 14-21 MHz: Green (20m-15m)
          // > 21 MHz: Blue (high bands open)

          vec3 red = vec3(0.937, 0.267, 0.267);     // #ef4444
          vec3 yellow = vec3(0.918, 0.702, 0.031);  // #eab308
          vec3 green = vec3(0.133, 0.773, 0.369);   // #22c55e
          vec3 blue = vec3(0.231, 0.510, 0.965);    // #3b82f6

          if (muf < 7.0) {
            return red;
          } else if (muf < 14.0) {
            // Blend red to yellow
            float t = (muf - 7.0) / 7.0;
            return mix(red, yellow, t);
          } else if (muf < 21.0) {
            // Blend yellow to green
            float t = (muf - 14.0) / 7.0;
            return mix(yellow, green, t);
          } else {
            // Blend green to blue (up to ~28 MHz)
            float t = clamp((muf - 21.0) / 7.0, 0.0, 1.0);
            return mix(green, blue, t);
          }
        }

        void main() {
          // Calculate MUF at this position
          float muf = calculateMUF(vPosition, sunPosition, sfi);

          // Get color based on MUF
          vec3 color = getMUFColor(muf);

          gl_FragColor = vec4(color, opacity);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    });
  }, [subsolar, sfi, opacity]);

  return (
    <mesh>
      <sphereGeometry args={[1.002, 64, 64]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
