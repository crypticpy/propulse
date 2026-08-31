/**
 * LocationMarker Component
 *
 * Renders a marker on the globe at a specific lat/lon position.
 * Used for home station and target location markers.
 * Target markers display difficulty-based coloring.
 * Home markers show a house emoji — hover/click reveals station info tooltip.
 *
 * Performance optimized with React.memo and proper comparison function.
 */

import { useMemo, useRef, useState, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { getScreenSpaceScale } from "@/lib/map/screenSpaceScale";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";

const SURFACE_OFFSET = 1.000002;

/**
 * Target pulse ring alpha.
 *
 * Was 0.3, which combined with a default renderOrder of 0 — under the night
 * shade — left the ring barely visible. It paints in the markers slot now, so
 * the alpha is the only thing dimming it.
 */
const PULSE_RING_OPACITY = 0.55;

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
  /** Overall size scale multiplier (default 1.0) */
  sizeScale?: number;
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
    prevProps.showDifficultyTag === nextProps.showDifficultyTag &&
    prevProps.sizeScale === nextProps.sizeScale
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
  sizeScale = 1.0,
}: LocationMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const markerRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);

  // Determine final color - use difficulty color for targets, or explicit color
  const finalColor = useMemo(() => {
    if (type === "target" && difficulty) {
      return getDifficultyColor(difficulty);
    }
    return color;
  }, [type, difficulty, color]);

  // Calculate 3D position
  const position = useMemo(() => {
    return latLonToVector3(lat, lon, SURFACE_OFFSET);
  }, [lat, lon]);

  // These sit at the surface, below the depth dome, so depthTest is off and the
  // far side has to be faded out on the CPU instead (globe stacking contract 1b)
  // — the same arrangement StationMarker3D uses. Drei Html is a DOM portal and
  // does not inherit the Three group visibility, so its state opacity must be
  // applied separately from the per-frame mesh ref.
  const { opacityRef, opacity: occlusionOpacity } = useGlobeOcclusion(lat, lon);

  // Pulse animation for target markers
  useFrame(({ camera, clock }) => {
    if (groupRef.current) {
      groupRef.current.getWorldPosition(worldPosition);
      groupRef.current.scale.setScalar(
        getScreenSpaceScale(camera.position.distanceTo(worldPosition)),
      );
    }

    const occlusion = opacityRef.current;
    if (groupRef.current) groupRef.current.visible = occlusion > 0.01;

    if (markerRef.current) {
      (markerRef.current.material as THREE.MeshBasicMaterial).opacity =
        occlusion;
    }

    if (pulseRef.current && type === "target") {
      const scale = 1 + Math.sin(clock.elapsedTime * 3) * 0.3;
      pulseRef.current.scale.set(scale, scale, scale);
      (pulseRef.current.material as THREE.MeshBasicMaterial).opacity =
        PULSE_RING_OPACITY * occlusion;
    }
  });

  const markerSize = (type === "home" ? 0.02 : 0.025) * sizeScale;
  const pulseSize = markerSize * 2;

  // Difficulty tag for targets
  const difficultyTag = difficulty ? DIFFICULTY_LABELS[difficulty] : null;

  // Home markers use emoji instead of text labels
  const isHome = type === "home";

  return (
    <group ref={groupRef} position={position}>
      {/* Pulse ring for target markers */}
      {type === "target" && (
        <mesh ref={pulseRef} renderOrder={GLOBE_LAYER_ORDER.markers}>
          <ringGeometry args={[pulseSize * 0.8, pulseSize, 32]} />
          <meshBasicMaterial
            color={finalColor}
            transparent
            opacity={PULSE_RING_OPACITY}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      )}

      {/* Main marker dot — interactive for home markers */}
      <mesh
        ref={markerRef}
        /* Above the pulse ring, but within the markers slot. */
        renderOrder={GLOBE_LAYER_ORDER.markers + 0.05}
        onClick={
          isHome
            ? (event) => {
                event.stopPropagation();
                setShowTooltip((prev) => !prev);
              }
            : undefined
        }
        onPointerEnter={
          isHome
            ? (event) => {
                event.stopPropagation();
                setShowTooltip(true);
              }
            : undefined
        }
        onPointerLeave={isHome ? () => setShowTooltip(false) : undefined}
      >
        <sphereGeometry args={[markerSize, 16, 16]} />
        <meshBasicMaterial
          color={finalColor}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {/* Home: house emoji + hover tooltip */}
      {isHome && (
        <>
          <Html
            position={[0, markerSize * 2.5, 0]}
            center
            zIndexRange={[1, 0]}
            style={{
              pointerEvents: "none",
              opacity: occlusionOpacity,
              transition: "opacity 0.2s ease",
            }}
          >
            <div
              style={{
                width: "22px",
                height: "22px",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                filter: `drop-shadow(0 0 4px ${finalColor})`,
              }}
            >
              {"\uD83C\uDFE0"}
            </div>
          </Html>

          {/* Tooltip shown on hover/click */}
          {showTooltip && label && (
            <Html
              position={[0, markerSize * 5, 0]}
              center
              zIndexRange={[2, 1]}
              style={{
                pointerEvents: "none",
                opacity: occlusionOpacity,
                transition: "opacity 0.2s ease",
              }}
            >
              <div
                className="px-2.5 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap"
                style={{
                  backgroundColor: "rgba(10, 10, 26, 0.92)",
                  color: finalColor,
                  border: `1px solid ${finalColor}60`,
                  boxShadow: `0 0 12px ${finalColor}30`,
                  lineHeight: 1.4,
                }}
              >
                {label}
              </div>
            </Html>
          )}
        </>
      )}

      {/* Target: text label with optional difficulty tag */}
      {!isHome && label && (
        <Html
          position={[0, markerSize * 3, 0]}
          center
          zIndexRange={[1, 0]}
          style={{
            pointerEvents: "none",
            opacity: occlusionOpacity,
            transition: "opacity 0.2s ease",
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
