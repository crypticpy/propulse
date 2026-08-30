/**
 * AuroraOverlay Component
 *
 * Renders the NOAA OVATION aurora probability grid as a draped
 * equirectangular texture on the globe, instead of a THREE.Points cloud.
 * The old per-vertex point-sprite approach produced visible rows of thin
 * stripes/dots at the grid's native spacing; painting the same data as
 * soft radial-gradient blobs onto an offscreen canvas (and letting canvas
 * gradient interpolation + THREE.LinearFilter texture sampling blend them)
 * reads as a filled, smoothly-blended aurora oval instead.
 *
 * Canvas raster + sphere alignment mirrors the other surfaceTexture-style
 * overlays in this codebase (DRAPOverlay3D, GOESCloudOverlay3D,
 * WeatherRadarOverlay): equirectangular canvas with
 * x = (lon + 180) / 360 * width, y = (90 - lat) / 180 * height, applied to
 * a default-UV SphereGeometry (no phiStart offset) to match the basemap's
 * texture convention (EarthSphere/NightLightsOverlay).
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { AuroraData } from "@/lib/api/aurora";
import {
  GLOBE_LAYER_ORDER,
  GLOBE_OVERLAY_MATERIAL,
} from "@/lib/map/globeRenderOrder";

interface AuroraOverlayProps {
  /** Aurora data from NOAA OVATION model */
  auroraData: AuroraData;
  /** Minimum aurora probability to display (0-100) */
  minProbability?: number;
}

/** Equirectangular raster size for the aurora texture (2:1 aspect). */
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 512;

/**
 * NOAA OVATION ships a ~1-degree lat/lon grid. Paint each surviving sample
 * as a soft radial-gradient blob a bit larger than one grid cell so
 * neighboring samples overlap and blend into a continuous field instead of
 * leaving visible gaps between rows.
 */
const DEG_PX = TEXTURE_WIDTH / 360;
const BLOB_RADIUS = DEG_PX * 1.8;

/** Sphere radius for the aurora shell — matches the previous point-cloud layer. */
const RADIUS = 1.015;

/**
 * Green -> yellow -> red ramp driven by aurora probability (0-100), at the
 * given alpha. Returns a CSS rgba() string for canvas fillStyle use.
 */
function auroraRGBA(probability: number, alpha: number): string {
  const t = Math.min(1, Math.max(0, probability / 100));
  let r: number;
  let g: number;
  if (t < 0.5) {
    // green -> yellow
    r = Math.round(510 * t);
    g = 255;
  } else {
    // yellow -> red
    r = 255;
    g = Math.round(255 - 510 * (t - 0.5));
  }
  return `rgba(${r}, ${g}, 0, ${alpha})`;
}

/**
 * Rasterize the OVATION probability grid into an equirectangular canvas.
 * Points below minProbability are skipped entirely (left fully transparent),
 * matching the previous points-cloud filter. Returns both the canvas and
 * how many points were actually painted, so the caller can skip creating a
 * texture/mesh when nothing is visible.
 */
function rasterizeAurora(
  data: AuroraData,
  minProbability: number,
): { canvas: HTMLCanvasElement; visibleCount: number } {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;

  let visibleCount = 0;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { canvas, visibleCount };
  }

  for (const coord of data.coordinates) {
    if (coord.aurora < minProbability) continue;
    visibleCount++;

    // Equirectangular projection: lon [-180,180] -> x [0, TEXTURE_WIDTH],
    // lat [90,-90] -> y [0, TEXTURE_HEIGHT].
    const x = ((coord.lon + 180) / 360) * TEXTURE_WIDTH;
    const y = ((90 - coord.lat) / 180) * TEXTURE_HEIGHT;

    const peakAlpha = Math.min(1, Math.max(0, coord.aurora / 100));
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, BLOB_RADIUS);
    gradient.addColorStop(0, auroraRGBA(coord.aurora, peakAlpha));
    gradient.addColorStop(0.6, auroraRGBA(coord.aurora, peakAlpha * 0.45));
    gradient.addColorStop(1, auroraRGBA(coord.aurora, 0));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, BLOB_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  return { canvas, visibleCount };
}

export function AuroraOverlay({
  auroraData,
  minProbability = 10,
}: AuroraOverlayProps) {
  // Rebuild the texture only when the data or filter changes — not per-frame.
  const texture = useMemo(() => {
    const { canvas, visibleCount } = rasterizeAurora(
      auroraData,
      minProbability,
    );
    if (visibleCount === 0) return null;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, [auroraData, minProbability]);

  // Dispose the previous texture whenever a new one is built, and on unmount.
  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  // Default phiStart aligns the sphere's UV with the canvas convention
  // above and with the basemap — see WeatherRadarOverlay/DRAPOverlay3D/
  // GOESCloudOverlay3D.
  const geometry = useMemo(
    () => new THREE.SphereGeometry(RADIUS, 128, 64),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  if (!texture) {
    return null;
  }

  return (
    <mesh geometry={geometry} renderOrder={GLOBE_LAYER_ORDER.volumes}>
      <meshBasicMaterial
        map={texture}
        side={THREE.FrontSide}
        blending={THREE.AdditiveBlending}
        {...GLOBE_OVERLAY_MATERIAL}
      />
    </mesh>
  );
}
