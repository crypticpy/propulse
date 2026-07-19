/**
 * WeatherAlerts3D
 *
 * Renders weather alert markers on the 3D globe as pin-style markers with
 * weather-appropriate emoji. Uses the same visual language as PinMarker
 * (stem + head + glow + Html emoji overlay) adapted for weather severity.
 *
 * Extreme and Severe alerts pulse; Moderate and Minor alerts stay static.
 * Uses batch occlusion for performance with many simultaneous alerts.
 */

import React, {
  useRef,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { WeatherAlert } from "@/lib/api/weather";
import { useGlobeOcclusionBatch } from "@/hooks/useGlobeOcclusionBatch";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WeatherAlerts3DProps {
  alerts: WeatherAlert[];
  onAlertClick?: (
    alert: WeatherAlert,
    screenPos: { x: number; y: number },
  ) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pin head radius */
const SIZE = 0.008;

/** Stem height above globe surface */
const STEM_HEIGHT = 0.02;

/** Stem radius */
const STEM_RADIUS = 0.001;

/** Slightly above globe surface so markers don't z-fight */
const SURFACE_RADIUS = 1.008;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get weather-appropriate emoji based on the event type.
 */
function getWeatherEmoji(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("tornado")) return "\uD83C\uDF2A\uFE0F";
  if (e.includes("hurricane") || e.includes("tropical")) return "\uD83C\uDF00";
  if (e.includes("thunderstorm") || e.includes("lightning"))
    return "\u26C8\uFE0F";
  if (e.includes("flood") || e.includes("flash")) return "\uD83C\uDF0A";
  if (
    e.includes("winter") ||
    e.includes("blizzard") ||
    e.includes("ice") ||
    e.includes("snow") ||
    e.includes("freeze") ||
    e.includes("frost")
  )
    return "\u2744\uFE0F";
  if (e.includes("wind") || e.includes("gale")) return "\uD83D\uDCA8";
  if (e.includes("heat") || e.includes("excessive")) return "\uD83D\uDD25";
  if (e.includes("fog")) return "\uD83C\uDF2B\uFE0F";
  if (e.includes("rain") || e.includes("shower")) return "\uD83C\uDF27\uFE0F";
  if (e.includes("fire")) return "\uD83D\uDD25";
  return "\u26A0\uFE0F"; // default warning
}

/**
 * Convert lat/lon to a 3D position on the globe.
 * Uses the same convention as every other globe component in the project.
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Get the "up" direction at a given lat/lon (normal to the sphere surface).
 */
function getUpDirection(lat: number, lon: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize();
}

/**
 * Return the severity color matching the 2D FlatMapView palette.
 */
function severityColor(severity: WeatherAlert["severity"]): string {
  switch (severity) {
    case "Extreme":
      return "#ff0040";
    case "Severe":
      return "#ff6600";
    case "Moderate":
      return "#ffaa00";
    default:
      return "#ffdd44";
  }
}

/**
 * Whether this severity level should pulse.
 */
function shouldPulse(severity: WeatherAlert["severity"]): boolean {
  return severity === "Extreme" || severity === "Severe";
}

// ---------------------------------------------------------------------------
// Sub-component: individual weather alert marker
// ---------------------------------------------------------------------------

interface AlertMarkerProps {
  alert: WeatherAlert;
  basePosition: THREE.Vector3;
  rotation: THREE.Euler;
  occlusionOpacity: number;
  onAlertClick?: (
    alert: WeatherAlert,
    screenPos: { x: number; y: number },
  ) => void;
  glowRef?: (el: THREE.Mesh | null) => void;
  sharedStemGeom: THREE.CylinderGeometry;
  sharedHeadGeom: THREE.SphereGeometry;
}

// Bug 24: Constants for emoji scaling (extracted to avoid allocations in useFrame)
const REFERENCE_DISTANCE = 3.0;
const BASE_FONT_SIZE = 24;
const MIN_FONT_SIZE = 16;
const MAX_FONT_SIZE = 48;

function AlertMarker({
  alert,
  basePosition,
  rotation,
  occlusionOpacity,
  onAlertClick,
  glowRef,
  sharedStemGeom,
  sharedHeadGeom,
}: AlertMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const stemMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const headMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowRingMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Bug 24: Use ref instead of state for camera distance to avoid re-renders
  const cameraDistRef = useRef(3.0);
  const emojiContainerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const { camera, size: canvasSize } = useThree();

  const color = severityColor(alert.severity);
  const emoji = getWeatherEmoji(alert.event);

  // Apply occlusion to materials + update emoji size via DOM manipulation
  useFrame(({ camera: cam }) => {
    if (stemMaterialRef.current) {
      stemMaterialRef.current.opacity = 0.7 * occlusionOpacity;
    }
    if (headMaterialRef.current) {
      headMaterialRef.current.opacity =
        (isHovered ? 1 : 0.85) * occlusionOpacity;
    }
    if (glowRingMaterialRef.current) {
      glowRingMaterialRef.current.opacity =
        (isHovered ? 0.5 : 0.3) * occlusionOpacity;
    }

    // Bug 24: Update ref + directly manipulate DOM instead of triggering React re-renders
    const dist = cam.position.length();
    if (Math.abs(dist - cameraDistRef.current) > 0.05) {
      cameraDistRef.current = dist;

      // Compute scaled emoji size
      const scaleFactor = REFERENCE_DISTANCE / dist;
      const fontSize = Math.min(
        MAX_FONT_SIZE,
        Math.max(MIN_FONT_SIZE, Math.round(BASE_FONT_SIZE * scaleFactor)),
      );
      const boxSize = fontSize + 8;
      const showLabel = dist < 2.0;

      // Directly update the emoji container DOM
      if (emojiContainerRef.current) {
        emojiContainerRef.current.style.width = `${boxSize}px`;
        emojiContainerRef.current.style.height = `${boxSize}px`;
        emojiContainerRef.current.style.fontSize = `${fontSize}px`;
        emojiContainerRef.current.style.filter = `drop-shadow(0 0 ${Math.max(4, fontSize / 4)}px ${color})`;
      }

      // Directly update the label DOM
      if (labelRef.current) {
        labelRef.current.style.display = showLabel ? "" : "none";
        if (showLabel) {
          labelRef.current.style.opacity = String(
            Math.min(1, (2.0 - dist) / 0.5),
          );
        }
      }
    }
  });

  const handleClick = useCallback(
    (event: THREE.Event) => {
      const e = event as unknown as { stopPropagation: () => void };
      e.stopPropagation();
      if (!onAlertClick) return;

      // Project 3D position to screen coordinates
      const worldPos = new THREE.Vector3(0, STEM_HEIGHT + SIZE * 2, 0);
      groupRef.current?.localToWorld(worldPos);
      const projected = worldPos.project(camera);

      const screenX = ((projected.x + 1) / 2) * canvasSize.width;
      const screenY = ((-projected.y + 1) / 2) * canvasSize.height;

      // Account for canvas offset in the page
      const canvas = document.querySelector("canvas");
      const rect = canvas?.getBoundingClientRect();
      const offsetX = rect?.left ?? 0;
      const offsetY = rect?.top ?? 0;

      onAlertClick(alert, {
        x: screenX + offsetX,
        y: screenY + offsetY,
      });
    },
    [alert, onAlertClick, camera, canvasSize],
  );

  const handlePointerEnter = useCallback((event: THREE.Event) => {
    const e = event as unknown as { stopPropagation: () => void };
    e.stopPropagation();
    setIsHovered(true);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  // Compute initial sizes from default distance for SSR/first render
  const initScaleFactor = REFERENCE_DISTANCE / 3.0;
  const initFontSize = Math.min(
    MAX_FONT_SIZE,
    Math.max(MIN_FONT_SIZE, Math.round(BASE_FONT_SIZE * initScaleFactor)),
  );
  const initBoxSize = initFontSize + 8;

  return (
    <group ref={groupRef} position={basePosition} rotation={rotation}>
      {/* Pin stem (vertical line from surface) */}
      <mesh
        position={[0, STEM_HEIGHT / 2, 0]}
        renderOrder={GLOBE_LAYER_ORDER.markers + 0.1}
      >
        <primitive object={sharedStemGeom} attach="geometry" />
        <meshBasicMaterial
          ref={stemMaterialRef}
          color={color}
          transparent
          opacity={0.7}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Pin head (sphere at top of stem) */}
      <mesh
        position={[0, STEM_HEIGHT + SIZE, 0]}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        renderOrder={GLOBE_LAYER_ORDER.markers + 0.2}
      >
        <primitive object={sharedHeadGeom} attach="geometry" />
        <meshBasicMaterial
          ref={headMaterialRef}
          color={color}
          transparent
          opacity={isHovered ? 1 : 0.85}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Glow ring at base */}
      <mesh
        ref={glowRef as unknown as React.Ref<THREE.Mesh>}
        rotation={[Math.PI / 2, 0, 0]}
        renderOrder={GLOBE_LAYER_ORDER.markers}
      >
        <ringGeometry args={[SIZE * 0.6, SIZE * 1.0, 32]} />
        <meshBasicMaterial
          ref={glowRingMaterialRef}
          color={color}
          transparent
          opacity={isHovered ? 0.5 : 0.3}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Weather emoji using Html overlay — scales with zoom via direct DOM updates */}
      <Html
        position={[0, STEM_HEIGHT + SIZE * 3, 0]}
        center
        zIndexRange={[1, 0]}
        style={{
          pointerEvents: "none",
          opacity: occlusionOpacity,
        }}
      >
        <div
          className="flex flex-col items-center"
          style={{
            transition: "transform 0.15s ease-out",
            transform: isHovered ? "scale(1.2)" : "scale(1)",
          }}
        >
          <div
            ref={emojiContainerRef}
            className="flex items-center justify-center"
            style={{
              width: `${initBoxSize}px`,
              height: `${initBoxSize}px`,
              fontSize: `${initFontSize}px`,
              lineHeight: 1,
              filter: `drop-shadow(0 0 ${Math.max(4, initFontSize / 4)}px ${color})`,
            }}
          >
            {emoji}
          </div>
          <div
            ref={labelRef}
            className="mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap text-center"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.85)",
              color,
              border: `1px solid ${color}50`,
              maxWidth: "140px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "none",
              opacity: 0,
              transition: "opacity 0.2s ease",
            }}
          >
            {alert.event}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const WeatherAlerts3D = React.memo(function WeatherAlerts3D({
  alerts,
  onAlertClick,
}: WeatherAlerts3DProps) {
  // Shared geometries — created once in parent, passed to all AlertMarker children
  const sharedStemGeom = useMemo(
    () => new THREE.CylinderGeometry(STEM_RADIUS, STEM_RADIUS, STEM_HEIGHT, 8),
    [],
  );
  const sharedHeadGeom = useMemo(
    () => new THREE.SphereGeometry(SIZE, 16, 16),
    [],
  );

  // Dispose shared geometries on unmount
  useEffect(() => {
    return () => {
      sharedStemGeom.dispose();
      sharedHeadGeom.dispose();
    };
  }, [sharedStemGeom, sharedHeadGeom]);

  // Refs for glow meshes that need animated opacity (pulse)
  const glowRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Batch occlusion for all alert positions
  const occlusionPositions = useMemo(
    () => alerts.map((a) => ({ lat: a.lat, lon: a.lon })),
    [alerts],
  );
  const { getOpacity, version: _occlusionVersion } =
    useGlobeOcclusionBatch(occlusionPositions);

  // Pre-compute positions and rotations
  const alertData = useMemo(() => {
    return alerts.map((alert) => {
      const basePosition = latLonToVector3(
        alert.lat,
        alert.lon,
        SURFACE_RADIUS,
      );
      const upDirection = getUpDirection(alert.lat, alert.lon);

      const quaternion = new THREE.Quaternion();
      const defaultUp = new THREE.Vector3(0, 1, 0);
      quaternion.setFromUnitVectors(defaultUp, upDirection);
      const rotation = new THREE.Euler().setFromQuaternion(quaternion);

      return { alert, basePosition, rotation };
    });
  }, [alerts]);

  // Build an index mapping into glowRefs for only the pulsing alerts
  const pulseIndices = useMemo(() => {
    const indices: { refIndex: number; alertIndex: number }[] = [];
    let refIdx = 0;
    for (let i = 0; i < alerts.length; i++) {
      if (shouldPulse(alerts[i].severity)) {
        indices.push({ refIndex: refIdx, alertIndex: i });
        refIdx++;
      }
    }
    return indices;
  }, [alerts]);

  // Single useFrame drives all pulse animations
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (const { refIndex, alertIndex } of pulseIndices) {
      const mesh = glowRefs.current[refIndex];
      if (mesh) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.3 + 0.25 * Math.sin(t * 3 + alertIndex * 0.7);
      }
    }
  });

  if (alerts.length === 0) {
    return null;
  }

  // Reset the ref array length to match current pulsing count
  glowRefs.current.length = pulseIndices.length;

  let pulseRefCounter = 0;

  return (
    <group>
      {alertData.map(({ alert, basePosition, rotation }) => {
        const pulses = shouldPulse(alert.severity);

        // Capture a stable ref index for this pulsing alert
        let currentPulseRef: number | null = null;
        if (pulses) {
          currentPulseRef = pulseRefCounter;
          pulseRefCounter++;
        }

        const refCallback =
          pulses && currentPulseRef !== null
            ? (el: THREE.Mesh | null) => {
                glowRefs.current[currentPulseRef!] = el;
              }
            : undefined;

        return (
          <AlertMarker
            key={alert.id}
            alert={alert}
            basePosition={basePosition}
            rotation={rotation}
            occlusionOpacity={getOpacity(alert.lat, alert.lon)}
            onAlertClick={onAlertClick}
            glowRef={refCallback}
            sharedStemGeom={sharedStemGeom}
            sharedHeadGeom={sharedHeadGeom}
          />
        );
      })}
    </group>
  );
});

export default WeatherAlerts3D;
