/**
 * EarthSphere Component
 *
 * 3D Earth mesh with NASA Blue Marble textures.
 * Supports day texture with optional night lights overlay.
 */

import { useRef, useMemo, useEffect } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { getStandardMapCanvas } from "@/lib/utils/standardMap";
import { useSeasonalDayTexture } from "./hooks/useSeasonalDayTexture";

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

export function EarthSphere({ onClick, grayscale = false }: EarthSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Load Earth textures
  const baseDayTexture = useTexture("/textures/earth-day.jpg");
  // Graceful upgrade to a monthly Blue Marble texture when one is published
  // at /textures/months/earth-day-MM.jpg; falls back to the base texture.
  const dayTexture = useSeasonalDayTexture(baseDayTexture);

  // Standard-mode base map texture (vector-like land/ocean fills)
  const standardTexture = useMemo(() => {
    const canvas = getStandardMapCanvas();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => {
    return () => {
      standardTexture.dispose();
    };
  }, [standardTexture]);

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
      {grayscale ? (
        // Standard style: unlit material for a clean, lightweight "map" look
        <meshBasicMaterial map={standardTexture} color={0xffffff} />
      ) : (
        <meshStandardMaterial
          map={dayTexture}
          roughness={0.7}
          metalness={0.1}
        />
      )}
    </mesh>
  );
}
