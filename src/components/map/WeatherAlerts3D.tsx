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

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
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
const SURFACE_RADIUS = 1.004;

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
        const color = severityColor(alert.severity);
        const pulses = shouldPulse(alert.severity);

        // Capture a stable ref index for this pulsing alert
        let currentPulseRef: number | null = null;
        if (pulses) {
          currentPulseRef = pulseRefCounter;
          pulseRefCounter++;
        }

        return (
          <group key={alert.id} position={position} quaternion={quaternion}>
            {/* Glow triangle (behind, slightly larger) */}
            <mesh
              ref={
                pulses && currentPulseRef !== null
                  ? (el) => {
                      glowRefs.current[currentPulseRef!] = el;
                    }
                  : undefined
              }
              geometry={glowGeom}
              renderOrder={1}
            >
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
          </group>
        );
      })}
    </group>
  );
});

export default WeatherAlerts3D;
