/**
 * AuroraOverlay Component
 *
 * Renders aurora oval visualization on the 3D globe.
 * Uses a custom shader to create a glowing aurora effect based on
 * NOAA OVATION probability data.
 */

import { useMemo } from "react";
import * as THREE from "three";
import type { AuroraData } from "@/lib/api/aurora";

interface AuroraOverlayProps {
  /** Aurora data from NOAA OVATION model */
  auroraData: AuroraData;
  /** Minimum aurora probability to display (0-100) */
  minProbability?: number;
}

/**
 * Get aurora color based on probability
 * Low: purple glow, Medium: purple-green, High: bright green
 */
function getAuroraColor(probability: number): THREE.Color {
  if (probability >= 60) {
    // High aurora: bright green
    return new THREE.Color(0x00ff88);
  } else if (probability >= 30) {
    // Medium aurora: purple-green blend
    const t = (probability - 30) / 30;
    const r = Math.floor(102 * (1 - t));
    const g = Math.floor(255 * t + 68 * (1 - t));
    const b = Math.floor(136 * (1 - t) + 136 * t);
    return new THREE.Color(`rgb(${r}, ${g}, ${b})`);
  } else {
    // Low aurora: subtle purple
    return new THREE.Color(0x8844ff);
  }
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export function AuroraOverlay({
  auroraData,
  minProbability = 10,
}: AuroraOverlayProps) {
  // Filter and prepare aurora points
  const auroraPoints = useMemo(() => {
    const filteredCoords = auroraData.coordinates.filter(
      (coord) => coord.aurora >= minProbability,
    );

    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];

    // Radius slightly above Earth surface for aurora shell
    const radius = 1.015;

    filteredCoords.forEach((coord) => {
      const pos = latLonToVector3(coord.lat, coord.lon, radius);
      positions.push(pos.x, pos.y, pos.z);

      const color = getAuroraColor(coord.aurora);
      colors.push(color.r, color.g, color.b);

      // Size based on probability - higher probability = larger point
      const size = 0.01 + (coord.aurora / 100) * 0.02;
      sizes.push(size);
    });

    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      sizes: new Float32Array(sizes),
      count: filteredCoords.length,
    };
  }, [auroraData, minProbability]);

  // Custom shader material for glowing aurora points
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 customColor;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = customColor;

          // Slight shimmer effect based on position
          float shimmer = 0.8 + 0.2 * sin(position.x * 20.0 + position.y * 20.0);
          vAlpha = shimmer;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Create soft circular point with glow
          float dist = length(gl_PointCoord - vec2(0.5));

          if (dist > 0.5) {
            discard;
          }

          // Soft falloff for glow effect
          float alpha = (1.0 - dist * 2.0) * vAlpha * 0.6;

          // Add slight glow around edges
          float glow = exp(-dist * 4.0) * 0.3;

          gl_FragColor = vec4(vColor, alpha + glow);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  // Create buffer geometry with aurora data
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(auroraPoints.positions, 3),
    );
    geo.setAttribute(
      "customColor",
      new THREE.BufferAttribute(auroraPoints.colors, 3),
    );
    geo.setAttribute("size", new THREE.BufferAttribute(auroraPoints.sizes, 1));

    return geo;
  }, [auroraPoints]);

  if (auroraPoints.count === 0) {
    return null;
  }

  return <points geometry={geometry} material={shaderMaterial} />;
}
