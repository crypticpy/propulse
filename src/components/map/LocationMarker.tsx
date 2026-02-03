/**
 * LocationMarker Component
 *
 * Renders a marker on the globe at a specific lat/lon position.
 * Used for home station and target location markers.
 * Target markers display difficulty-based coloring.
 *
 * Performance optimized with React.memo and proper comparison function.
 */

import { useMemo, useRef, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

// Difficulty level type (1-5 scale)
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

// Difficulty color mapping (green for easy, red for difficult)
export const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
  1: "#00FF88", // Easy - Signal green
  2: "#7ACC7A", // Moderate - Light green
  3: "#FFD23F", // Challenging - Amber
  4: "#FF8C42", // Difficult - Orange
  5: "#FF4444", // Extreme - Red
};

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  1: "Easy",
  2: "Moderate",
  3: "Challenging",
  4: "Difficult",
  5: "Extreme",
};

/**
 * Get color for a given difficulty level
 */
export function getDifficultyColor(difficulty: DifficultyLevel): string {
  return DIFFICULTY_COLORS[difficulty] || DIFFICULTY_COLORS[3];
}

interface LocationMarkerProps {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Marker color (overridden by difficulty for targets) */
  color?: string;
  /** Optional label text */
  label?: string;
  /** Marker type for styling */
  type?: "home" | "target";
  /** Difficulty level (1-5) for target markers */
  difficulty?: DifficultyLevel;
  /** Whether to show the difficulty tag */
  showDifficultyTag?: boolean;
}

/**
 * Convert lat/lon to 3D position on sphere
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
 * Comparison function for LocationMarker memo
 * Only re-render when position, color, or important props change
 */
function locationMarkerPropsAreEqual(
  prevProps: LocationMarkerProps,
  nextProps: LocationMarkerProps,
): boolean {
  return (
    prevProps.lat === nextProps.lat &&
    prevProps.lon === nextProps.lon &&
    prevProps.color === nextProps.color &&
    prevProps.label === nextProps.label &&
    prevProps.type === nextProps.type &&
    prevProps.difficulty === nextProps.difficulty &&
    prevProps.showDifficultyTag === nextProps.showDifficultyTag
  );
}

function LocationMarkerInner({
  lat,
  lon,
  color = "#ff6b35",
  label,
  type = "target",
  difficulty,
  showDifficultyTag = true,
}: LocationMarkerProps) {
  const markerRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  // Determine final color - use difficulty color for targets, or explicit color
  const finalColor = useMemo(() => {
    if (type === "target" && difficulty) {
      return getDifficultyColor(difficulty);
    }
    return color;
  }, [type, difficulty, color]);

  // Calculate 3D position
  const position = useMemo(() => {
    return latLonToVector3(lat, lon, 1.01);
  }, [lat, lon]);

  // Pulse animation for target markers
  useFrame(({ clock }) => {
    if (pulseRef.current && type === "target") {
      const scale = 1 + Math.sin(clock.elapsedTime * 3) * 0.3;
      pulseRef.current.scale.set(scale, scale, scale);
    }
  });

  const markerSize = type === "home" ? 0.02 : 0.025;
  const pulseSize = markerSize * 2;

  // Difficulty tag for targets
  const difficultyTag = difficulty ? DIFFICULTY_LABELS[difficulty] : null;

  return (
    <group position={position}>
      {/* Pulse ring for target markers */}
      {type === "target" && (
        <mesh ref={pulseRef}>
          <ringGeometry args={[pulseSize * 0.8, pulseSize, 32]} />
          <meshBasicMaterial
            color={finalColor}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Main marker dot */}
      <mesh ref={markerRef}>
        <sphereGeometry args={[markerSize, 16, 16]} />
        <meshBasicMaterial color={finalColor} />
      </mesh>

      {/* Label with optional difficulty tag */}
      {label && (
        <Html
          position={[0, markerSize * 3, 0]}
          center
          style={{
            pointerEvents: "none",
          }}
        >
          <div className="flex flex-col items-center gap-0.5">
            {/* Main label */}
            <div
              className="px-2 py-0.5 rounded text-xs font-mono whitespace-nowrap"
              style={{
                backgroundColor: "rgba(10, 10, 26, 0.9)",
                color: finalColor,
                border: `1px solid ${finalColor}`,
                boxShadow: `0 0 10px ${finalColor}40`,
              }}
            >
              {label}
            </div>
            {/* Difficulty tag below label */}
            {type === "target" && showDifficultyTag && difficultyTag && (
              <div
                className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                style={{
                  backgroundColor: `${finalColor}20`,
                  color: finalColor,
                  border: `1px solid ${finalColor}50`,
                }}
              >
                {difficultyTag}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Memoized LocationMarker component
 * Only re-renders when relevant props change
 */
export const LocationMarker = memo(
  LocationMarkerInner,
  locationMarkerPropsAreEqual,
);
