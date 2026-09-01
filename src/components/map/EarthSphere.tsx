/**
 * EarthSphere Component
 *
 * 3D Earth mesh with NASA Blue Marble textures.
 * Supports day texture with optional night lights overlay.
 */

import { useRef, useMemo, useEffect } from "react";
import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getStandardMapCanvas } from "@/lib/utils/standardMap";
import { useSeasonalDayTexture } from "./hooks/useSeasonalDayTexture";
import { useThemeStore } from "@/stores/themeStore";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";

interface EarthSphereProps {
  /** Callback when Earth is clicked with lat/lon */
  onClick?: (lat: number, lon: number) => void;
  /** Render with desaturated (grayscale) texture */
  grayscale?: boolean;
}

/**
 * Convert 3D intersection point to lat/lon
 *
 * The forward transformation (latLonToVector3) uses:
 *   phi = (90 - lat) * π/180
 *   theta = (lon + 180) * π/180
 *   x = -radius * sin(phi) * cos(theta)
 *   y = radius * cos(phi)
 *   z = radius * sin(phi) * sin(theta)
 *
 * Inverse requires: theta = atan2(z, -x), then lon = theta - 180°
 */
function vector3ToLatLon(point: THREE.Vector3): { lat: number; lon: number } {
  const normalized = point.clone().normalize();

  // Latitude from Y coordinate (Y is up in Three.js)
  // y = cos(phi) where phi = (90 - lat) in radians
  // So lat = asin(y)
  const lat = Math.asin(normalized.y) * (180 / Math.PI);

  // Longitude from X and Z coordinates
  // x = -sin(phi) * cos(theta)
  // z = sin(phi) * sin(theta)
  // theta = atan2(z, -x)
  // lon = theta * 180/π - 180
  const theta = Math.atan2(normalized.z, -normalized.x);
  let lon = theta * (180 / Math.PI) - 180;

  // Normalize longitude to [-180, 180]
  if (lon < -180) {
    lon += 360;
  }
  if (lon > 180) {
    lon -= 360;
  }

  return { lat, lon };
}

function StandardEarthMaterial() {
  const themeId = useThemeStore((s) => s.themeId);
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const effectiveQuality = useResolvedDisplayQuality(displayQuality).effective;
  const maxTextureSize = useThree((state) => state.gl.capabilities.maxTextureSize);
  const standardTexture = useMemo(() => {
    const requestedWidth =
      effectiveQuality === "uhd" || effectiveQuality === "extreme"
        ? 4096
        : 2048;
    const width = Math.max(1024, Math.min(requestedWidth, maxTextureSize));
    const canvas = getStandardMapCanvas(width, width / 2, themeId);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, [effectiveQuality, maxTextureSize, themeId]);

  useEffect(() => {
    return () => standardTexture.dispose();
  }, [standardTexture]);

  return <meshBasicMaterial map={standardTexture} color={0xffffff} />;
}

function SatelliteEarthMaterial() {
  const baseDayTexture = useTexture("/textures/earth-day.jpg");
  const dayTexture = useSeasonalDayTexture(baseDayTexture);

  return (
    <meshStandardMaterial map={dayTexture} roughness={0.7} metalness={0.1} />
  );
}

export function EarthSphere({ onClick, grayscale = false }: EarthSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Handle click
  const handleClick = (event: THREE.Event & { point?: THREE.Vector3 }) => {
    if (onClick && event.point) {
      const { lat, lon } = vector3ToLatLon(event.point);
      onClick(lat, lon);
    }
  };

  return (
    <mesh
      ref={meshRef}
      onClick={handleClick}
      onPointerOver={() => {
        document.body.style.cursor = "crosshair";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <sphereGeometry args={[1, 64, 64]} />
      {grayscale ? <StandardEarthMaterial /> : <SatelliteEarthMaterial />}
    </mesh>
  );
}
