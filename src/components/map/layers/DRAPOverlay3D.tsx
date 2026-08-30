/**
 * DRAPOverlay3D Component
 *
 * Renders D-Region Absorption Prediction (DRAP) data on the 3D globe as a
 * smooth canvas-composited heatmap texture on a sphere, replacing the old
 * instanced-dots approach.
 *
 * Each grid point with HAF > 0 is painted as a radial-gradient Gaussian blob
 * onto an equirectangular canvas (1024x512). The canvas is applied as a
 * CanvasTexture to a slightly-above-surface sphere.
 *
 * DRAP values represent the Highest Affected Frequency (HAF) in MHz.
 * Higher HAF = more severe absorption:
 *   - 0 MHz: no absorption (not rendered)
 *   - 0.1-5 MHz: mild absorption (blue)
 *   - 5-10 MHz: moderate absorption (yellow/orange)
 *   - 10-20 MHz: strong absorption (orange/red)
 *   - >20 MHz: severe blackout (deep red)
 *
 * Subtle opacity pulse animation on the overlay.
 */

import React, { useRef, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLOBE_LAYER_ORDER, GLOBE_OVERLAY_MATERIAL } from "@/lib/map/globeRenderOrder";

// =============================================================================
// TYPES
// =============================================================================

interface DRAPData {
  frequencies: number[][]; // lat x lon grid of Highest Affected Frequency (MHz)
  latitudes: number[];
  longitudes: number[];
}

interface DRAPOverlay3DProps {
  data: DRAPData;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CANVAS_W = 1024;
const CANVAS_H = 512;

// =============================================================================
// COLOR HELPER
// =============================================================================

function hafToRGBA(hafMHz: number, alpha: number): string {
  let r: number, g: number, b: number;
  if (hafMHz <= 5) {
    r = 34;
    g = 102;
    b = 255; // blue
  } else if (hafMHz <= 10) {
    const t = (hafMHz - 5) / 5;
    r = Math.round(34 + (221 - 34) * t);
    g = Math.round(102 + (204 - 102) * t);
    b = Math.round(255 + (34 - 255) * t);
  } else if (hafMHz <= 20) {
    const t = (hafMHz - 10) / 10;
    r = Math.round(221 + (238 - 221) * t);
    g = Math.round(204 + (136 - 204) * t);
    b = Math.round(34 + (0 - 34) * t);
  } else {
    const t = Math.min(1, (hafMHz - 20) / 10);
    r = Math.round(238 + (238 - 238) * t);
    g = Math.round(136 + (34 - 136) * t);
    b = Math.round(0 + (34 - 0) * t);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// =============================================================================
// CANVAS COMPOSITING
// =============================================================================

function compositeDRAPHeatmap(data: DRAPData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const { frequencies, latitudes, longitudes } = data;
  // Grid spacing in pixels (~4 deg longitude), with 1.5x overlap for smooth blending
  const blobRadius = (4 / 360) * CANVAS_W * 1.5;

  for (let latIdx = 0; latIdx < latitudes.length; latIdx++) {
    const row = frequencies[latIdx];
    if (!row) continue;
    for (let lonIdx = 0; lonIdx < longitudes.length; lonIdx++) {
      const haf = row[lonIdx];
      if (haf == null || haf <= 0) continue;

      // Equirectangular projection: lon [-180,180] -> x [0, CANVAS_W]
      const x = ((longitudes[lonIdx] + 180) / 360) * CANVAS_W;
      // lat [90,-90] -> y [0, CANVAS_H]
      const y = ((90 - latitudes[latIdx]) / 180) * CANVAS_H;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, blobRadius);
      gradient.addColorStop(0, hafToRGBA(haf, 0.7));
      gradient.addColorStop(0.5, hafToRGBA(haf, 0.35));
      gradient.addColorStop(1, hafToRGBA(haf, 0));

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, blobRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const DRAPOverlay3D = React.memo(
  function DRAPOverlay3D({ data }: DRAPOverlay3DProps) {
    const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
    const textureRef = useRef<THREE.CanvasTexture | null>(null);
    const materialRef = useRef<THREE.MeshBasicMaterial>(null);

    // Composite heatmap when data changes
    useEffect(() => {
      if (!data?.latitudes?.length || !data?.frequencies?.length) return;

      const canvas = compositeDRAPHeatmap(data);

      // Dispose previous texture
      if (textureRef.current) textureRef.current.dispose();

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;

      textureRef.current = tex;
      setTexture(tex);
    }, [data]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (textureRef.current) {
          textureRef.current.dispose();
          textureRef.current = null;
        }
      };
    }, []);

    // Subtle pulse
    useFrame(({ clock }) => {
      if (materialRef.current) {
        const t = clock.getElapsedTime();
        materialRef.current.opacity = 0.7 + 0.08 * Math.sin(t * 0.8);
      }
    });

    if (!texture) return null;

    return (
      <mesh renderOrder={GLOBE_LAYER_ORDER.surfaceTexture}>
        <sphereGeometry args={[1.015, 128, 64]} />
        <meshBasicMaterial
          ref={materialRef}
          map={texture}
          opacity={0.7}
          side={THREE.FrontSide}
          {...GLOBE_OVERLAY_MATERIAL}
        />
      </mesh>
    );
  },
  (prev, next) => prev.data === next.data,
);

export default DRAPOverlay3D;
