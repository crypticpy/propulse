/**
 * EarthSphere Component
 *
 * 3D Earth mesh with NASA Blue Marble textures.
 * Supports day texture with optional night lights overlay.
 */

import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

interface EarthSphereProps {
  /** Auto-rotate the Earth */
  autoRotate?: boolean;
  /** Rotation speed when auto-rotating (radians per frame) */
  rotationSpeed?: number;
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

export function EarthSphere({
  autoRotate = false,
  rotationSpeed = 0.001,
  onClick,
  grayscale = false,
}: EarthSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Load Earth textures
  const [dayTexture, nightTexture] = useTexture([
    "/textures/earth-day.jpg",
    "/textures/earth-night.jpg",
  ]);

  // Create grayscale variant of day texture (with proper GPU disposal)
  const [grayscaleTexture, setGrayscaleTexture] =
    useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    if (!dayTexture?.image) return;
    const img = dayTexture.image as HTMLImageElement;
    if (!img.naturalWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.filter = "grayscale(1) contrast(1.1) brightness(1.05)";
    ctx.drawImage(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    setGrayscaleTexture(tex);
    return () => {
      tex.dispose();
    };
  }, [dayTexture]);

  // Auto-rotation
  useFrame(() => {
    if (autoRotate && meshRef.current) {
      meshRef.current.rotation.y += rotationSpeed;
    }
  });

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
      <meshStandardMaterial
        map={grayscale && grayscaleTexture ? grayscaleTexture : dayTexture}
        emissiveMap={nightTexture}
        emissive={new THREE.Color(0.3, 0.3, 0.4)}
        emissiveIntensity={0.8}
        roughness={0.7}
        metalness={0.1}
      />
    </mesh>
  );
}
