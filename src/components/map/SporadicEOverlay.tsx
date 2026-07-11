/**
 * SporadicEOverlay Component
 *
 * Renders a semi-transparent Sporadic E probability overlay on the globe.
 * Uses a custom shader to visualize Es probability with warm color coding:
 * - Blue: < 20% (low probability)
 * - Yellow: 20-40% (moderate probability)
 * - Orange: 40-60% (likely)
 * - Red: > 60% (highly likely)
 *
 * The overlay focuses on mid-latitudes (30-50 degrees) where Es is most common.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { useSporadicEGrid } from "@/hooks/useSporadicE";

interface SporadicEOverlayProps {
  /** Current display time */
  date: Date;
  /** Overlay opacity (0-1) */
  opacity?: number;
  /** Minimum probability to display (0-100) */
  minProbability?: number;
}

/**
 * Get Es color based on probability
 * Uses warm colors to distinguish from other overlays
 */
function getEsColor(probability: number): THREE.Color {
  if (probability >= 60) {
    // High: bright red
    return new THREE.Color(0xff4444);
  } else if (probability >= 40) {
    // Likely: orange
    const t = (probability - 40) / 20;
    return new THREE.Color().lerpColors(
      new THREE.Color(0xffa500),
      new THREE.Color(0xff4444),
      t,
    );
  } else if (probability >= 20) {
    // Moderate: yellow to orange
    const t = (probability - 20) / 20;
    return new THREE.Color().lerpColors(
      new THREE.Color(0xffdd00),
      new THREE.Color(0xffa500),
      t,
    );
  } else {
    // Low: blue to yellow
    const t = probability / 20;
    return new THREE.Color().lerpColors(
      new THREE.Color(0x4488ff),
      new THREE.Color(0xffdd00),
      t,
    );
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

export function SporadicEOverlay({
  date,
  opacity = 0.5,
  minProbability = 10,
}: SporadicEOverlayProps) {
  // Get Es probability grid
  const { grid } = useSporadicEGrid(date, 5);

  // Filter and prepare Es points
  const esPoints = useMemo(() => {
    const filteredGrid = grid.filter(
      (point) => point.probability >= minProbability,
    );

    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];

    // Radius slightly above Earth surface for Es shell
    // Positioned between aurora and MUF layers
    const radius = 1.008;

    filteredGrid.forEach((point) => {
      const pos = latLonToVector3(point.lat, point.lon, radius);
      positions.push(pos.x, pos.y, pos.z);

      const color = getEsColor(point.probability);
      colors.push(color.r, color.g, color.b);

      // Size based on probability - higher probability = larger point
      const size = 0.02 + (point.probability / 100) * 0.03;
      sizes.push(size);
    });

    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      sizes: new Float32Array(sizes),
      count: filteredGrid.length,
    };
  }, [grid, minProbability]);

  // Custom shader material for glowing Es probability points
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        opacity: { value: opacity },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 customColor;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float opacity;

        void main() {
          vColor = customColor;
          vAlpha = opacity;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // Point size based on distance
          gl_PointSize = size * (500.0 / -mvPosition.z);
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

          // Soft falloff for Es glow effect
          float alpha = (1.0 - dist * 2.0) * vAlpha;

          // Add glow around edges
          float glow = exp(-dist * 2.5) * 0.4;

          gl_FragColor = vec4(vColor, alpha + glow);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, [opacity]);

  // Create buffer geometry with Es data
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(esPoints.positions, 3),
    );
    geo.setAttribute(
      "customColor",
      new THREE.BufferAttribute(esPoints.colors, 3),
    );
    geo.setAttribute("size", new THREE.BufferAttribute(esPoints.sizes, 1));

    return geo;
  }, [esPoints]);

  if (esPoints.count === 0) {
    return null;
  }

  return <points geometry={geometry} material={shaderMaterial} />;
}

/**
 * Es Legend Component for displaying color scale
 */
export function SporadicELegend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <span className="text-gray-400">Es:</span>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-full bg-[#4488ff]" title="Low (<20%)" />
        <div
          className="w-3 h-3 rounded-full bg-[#ffdd00]"
          title="Moderate (20-40%)"
        />
        <div
          className="w-3 h-3 rounded-full bg-[#ffa500]"
          title="Likely (40-60%)"
        />
        <div
          className="w-3 h-3 rounded-full bg-[#ff4444]"
          title="High (>60%)"
        />
      </div>
      <span className="text-gray-500">Probability</span>
    </div>
  );
}
