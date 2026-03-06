/**
 * AuroraOverlay Component
 *
 * Renders aurora oval visualization on the 3D globe.
 * Uses a custom shader to create a glowing aurora effect based on
 * NOAA OVATION probability data.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { AuroraData } from "@/lib/api/aurora";

interface AuroraOverlayProps {
  /** Aurora data from NOAA OVATION model */
  auroraData: AuroraData;
  /** Minimum aurora probability to display (0-100) */
  minProbability?: number;
}

/** Reusable scratch Color to avoid per-point allocation */
const _tmpColor = new THREE.Color();

/** Degree-to-radian conversion factor */
const DEG2RAD = Math.PI / 180;

/**
 * Write aurora color into the scratch _tmpColor based on probability.
 * Low: purple glow, Medium: purple-green, High: bright green.
 * Returns _tmpColor for chaining — do NOT store the reference.
 */
function setAuroraColor(probability: number): THREE.Color {
  if (probability >= 60) {
    // High aurora: bright green
    return _tmpColor.setRGB(0, 1, 0x88 / 255);
  } else if (probability >= 30) {
    // Medium aurora: purple-green blend
    const t = (probability - 30) / 30;
    const r = (102 * (1 - t)) / 255;
    const g = (255 * t + 68 * (1 - t)) / 255;
    const b = (136 * (1 - t) + 136 * t) / 255;
    return _tmpColor.setRGB(r, g, b);
  } else {
    // Low aurora: subtle purple
    return _tmpColor.setRGB(0x88 / 255, 0x44 / 255, 1);
  }
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
      // Inline latLonToVector3 math — avoids intermediate Vector3 allocation
      const phi = (90 - coord.lat) * DEG2RAD;
      const theta = (coord.lon + 180) * DEG2RAD;
      const sinPhi = Math.sin(phi);
      positions.push(
        -radius * sinPhi * Math.cos(theta),
        radius * Math.cos(phi),
        radius * sinPhi * Math.sin(theta),
      );

      // Reuse scratch _tmpColor — avoids per-point Color allocation
      setAuroraColor(coord.aurora);
      colors.push(_tmpColor.r, _tmpColor.g, _tmpColor.b);

      // Size based on probability - higher probability = larger point
      // Increased base size for better visibility
      const size = 0.035 + (coord.aurora / 100) * 0.06;
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
      uniforms: {},
      vertexShader: `
        attribute float size;
        attribute vec3 customColor;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = customColor;

          // Slight shimmer effect based on position
          float shimmer = 0.85 + 0.15 * sin(position.x * 15.0 + position.y * 15.0);
          vAlpha = shimmer;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // Increased point size multiplier for better visibility
          gl_PointSize = size * (600.0 / -mvPosition.z);
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

          // Soft falloff for glow effect - increased alpha for visibility
          float alpha = (1.0 - dist * 2.0) * vAlpha * 1.0;

          // Add stronger glow around edges
          float glow = exp(-dist * 3.0) * 0.7;

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

  useEffect(() => {
    return () => {
      geometry.dispose();
      shaderMaterial.dispose();
    };
  }, [geometry, shaderMaterial]);

  if (auroraPoints.count === 0) {
    return null;
  }

  return (
    <points geometry={geometry} material={shaderMaterial} renderOrder={9} />
  );
}
