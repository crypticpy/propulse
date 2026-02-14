/**
 * WeatherAlerts3D
 *
 * Renders weather alert markers on the 3D globe as severity-colored
 * warning triangles with exclamation marks. Extreme and Severe alerts
 * pulse; Moderate and Minor alerts stay static.
 *
 * Matches the visual language of the 2D FlatMapView weather overlay
 * (same severity color scale, triangle + "!" motif).
 */

import React, { useRef, useMemo, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text, Html } from "@react-three/drei";
import * as THREE from "three";
import type { WeatherAlert } from "@/lib/api/weather";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WeatherAlerts3DProps {
  alerts: WeatherAlert[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Triangle half-extent — matches DEFAULT_MARKER_SIZE used elsewhere */
const SIZE = 0.006;

/** Slightly above globe surface so markers don't z-fight */
const SURFACE_RADIUS = 1.008;

/** Scale factor for the outer glow triangle */
const GLOW_SCALE = 1.35;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to a 3D position on the globe.
 * Uses the same convention as every other globe component in the project.
 */
function latLonTo3D(
  lat: number,
  lon: number,
  radius: number = SURFACE_RADIUS,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
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

/**
 * Truncate a string to a maximum length, appending "..." if truncated.
 */
function truncateLabel(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "\u2026" : text;
}

/**
 * Camera distance threshold — labels only show when zoomed in close enough.
 */
const LABEL_CAMERA_DISTANCE = 3.2;

// ---------------------------------------------------------------------------
// Shared geometry builders (called once via useMemo)
// ---------------------------------------------------------------------------

function createTriangleShape(s: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, s); // top
  shape.lineTo(s * 0.87, -s * 0.5); // bottom right
  shape.lineTo(-s * 0.87, -s * 0.5); // bottom left
  shape.closePath();
  return shape;
}

// ---------------------------------------------------------------------------
// Sub-component: individual alert marker with label + tooltip
// ---------------------------------------------------------------------------

interface AlertMarkerProps {
  alert: WeatherAlert;
  position: [number, number, number];
  quaternion: THREE.Quaternion;
  baseGeom: THREE.ShapeGeometry;
  glowGeom: THREE.ShapeGeometry;
  pulseRefCallback: ((el: THREE.Mesh | null) => void) | undefined;
}

function AlertMarker({
  alert,
  position,
  quaternion,
  baseGeom,
  glowGeom,
  pulseRefCallback,
}: AlertMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const color = severityColor(alert.severity);
  const pulses = shouldPulse(alert.severity);

  // Track camera distance to toggle label visibility
  useFrame(({ camera }) => {
    const camDist = camera.position.length();
    const shouldShow = camDist < LABEL_CAMERA_DISTANCE;
    if (shouldShow !== showLabel) {
      setShowLabel(shouldShow);
    }
  });

  const handlePointerEnter = useCallback(() => setHovered(true), []);
  const handlePointerLeave = useCallback(() => setHovered(false), []);

  return (
    <group
      position={position}
      quaternion={quaternion}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* Glow triangle (behind, slightly larger) */}
      <mesh ref={pulseRefCallback} geometry={glowGeom} renderOrder={1}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={pulses ? 0.3 : 0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Solid triangle */}
      <mesh geometry={baseGeom} renderOrder={2}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.85}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Exclamation mark */}
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          fontSize={SIZE * 1.1}
          color="#000000"
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
          depthOffset={-1}
        >
          !
        </Text>
      </Billboard>

      {/* Event type label (shown when zoomed in) */}
      {showLabel && (
        <Html
          center
          style={{
            pointerEvents: "none",
            userSelect: "none",
            transform: "translateY(14px)",
          }}
          zIndexRange={[1, 0]}
        >
          <div
            style={{
              fontSize: "9px",
              fontWeight: 500,
              color: "#ffffff",
              backgroundColor: "rgba(0, 0, 0, 0.70)",
              padding: "1px 4px",
              borderRadius: "3px",
              borderLeft: `2px solid ${color}`,
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            {truncateLabel(alert.event, 20)}
          </div>
        </Html>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <Html
          center
          style={{
            pointerEvents: "none",
            userSelect: "none",
            transform: "translateY(-28px)",
          }}
          zIndexRange={[9999, 9998]}
        >
          <div
            style={{
              backgroundColor: "rgba(24, 24, 27, 0.95)",
              border: "1px solid rgba(63, 63, 70, 0.7)",
              borderRadius: "8px",
              padding: "8px 10px",
              maxWidth: "260px",
              whiteSpace: "normal",
              lineHeight: 1.4,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: "11px",
                color: "#ffffff",
                marginBottom: "3px",
              }}
            >
              {alert.event}
            </div>
            {alert.headline && (
              <div
                style={{
                  fontSize: "10px",
                  color: "#d4d4d8",
                  marginBottom: "4px",
                }}
              >
                {alert.headline}
              </div>
            )}
            {alert.areaDesc && (
              <div
                style={{
                  fontSize: "9px",
                  color: "#a1a1aa",
                  marginBottom: "4px",
                }}
              >
                {alert.areaDesc}
              </div>
            )}
            <span
              style={{
                display: "inline-block",
                fontSize: "9px",
                fontWeight: 600,
                color: "#000000",
                backgroundColor: color,
                padding: "1px 6px",
                borderRadius: "4px",
              }}
            >
              {alert.severity}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const WeatherAlerts3D = React.memo(function WeatherAlerts3D({
  alerts,
}: WeatherAlerts3DProps) {
  // Refs for glow meshes that need animated opacity
  const glowRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Shared triangle geometries — one for the solid fill, one for the glow
  const { baseGeom, glowGeom } = useMemo(() => {
    const baseShape = createTriangleShape(SIZE);
    const glowShape = createTriangleShape(SIZE * GLOW_SCALE);
    return {
      baseGeom: new THREE.ShapeGeometry(baseShape),
      glowGeom: new THREE.ShapeGeometry(glowShape),
    };
  }, []);

  // Pre-compute positions and quaternions so we don't allocate per frame
  const alertData = useMemo(() => {
    return alerts.map((alert) => {
      const position = latLonTo3D(alert.lat, alert.lon);
      const pos = new THREE.Vector3(...position);
      const up = pos.clone().normalize();
      const quat = new THREE.Quaternion();
      quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
      return { alert, position, quaternion: quat };
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
        mat.opacity = 0.3 + 0.2 * Math.sin(t * 3 + alertIndex * 0.7);
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
      {alertData.map(({ alert, position, quaternion }) => {
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
            position={position}
            quaternion={quaternion}
            baseGeom={baseGeom}
            glowGeom={glowGeom}
            pulseRefCallback={refCallback}
          />
        );
      })}
    </group>
  );
});

export default WeatherAlerts3D;
